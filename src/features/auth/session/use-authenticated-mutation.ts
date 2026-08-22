import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type {
  DefaultError,
  MutateOptions,
  MutationFunctionContext,
  MutationKey,
  MutationObserverOptions,
} from '@tanstack/query-core'
import {
  MutationObserver,
  noop,
  notifyManager,
  shouldThrowError,
} from '@tanstack/query-core'
import { registerAuthenticatedPrincipalReset } from '../../../shared/lib/authenticated-principal-reset'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  StaleAuthenticatedSessionError,
  type AuthenticatedSessionSnapshot,
} from './session-boundary'
import { authenticatedQueryKeyForSession } from './authenticated-query-key'

export interface AuthenticatedMutationContext extends MutationFunctionContext {
  readonly sessionSnapshot: AuthenticatedSessionSnapshot
  isSessionCurrent: () => boolean
  assertSessionCurrent: () => void
  adoptSession: (snapshot: AuthenticatedSessionSnapshot) => void
}

export interface UseAuthenticatedMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
> {
  mutationFn: (
    variables: TVariables,
    context: AuthenticatedMutationContext,
  ) => Promise<TData>
  mutationKey?: MutationKey
  onMutate?: (
    variables: TVariables,
    context: AuthenticatedMutationContext,
  ) => Promise<TOnMutateResult> | TOnMutateResult
  onSuccess?: (
    data: TData,
    variables: TVariables,
    onMutateResult: TOnMutateResult | undefined,
    context: AuthenticatedMutationContext,
  ) => Promise<unknown> | unknown
  onError?: (
    error: TError,
    variables: TVariables,
    onMutateResult: TOnMutateResult | undefined,
    context: AuthenticatedMutationContext,
  ) => Promise<unknown> | unknown
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    onMutateResult: TOnMutateResult | undefined,
    context: AuthenticatedMutationContext,
  ) => Promise<unknown> | unknown
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean)
  retryDelay?: number | ((failureCount: number, error: TError) => number)
  networkMode?: 'online' | 'always' | 'offlineFirst'
  gcTime?: number
  meta?: Record<string, unknown>
  scope?: { id: string }
  throwOnError?: boolean | ((error: TError) => boolean)
}

interface MutationEnvelope<TData, TError, TVariables, TOnMutateResult> {
  variables: TVariables
  initialSession: AuthenticatedSessionSnapshot
  completionSession: AuthenticatedSessionSnapshot
  callbacks?: MutateOptions<TData, TError, TVariables, TOnMutateResult>
}

interface MutationResultEnvelope<TOnMutateResult> {
  onMutateResult: TOnMutateResult | undefined
}

function mutationContext<
  TData,
  TError,
  TVariables,
  TOnMutateResult,
>(
  envelope: MutationEnvelope<TData, TError, TVariables, TOnMutateResult>,
  context: MutationFunctionContext,
): AuthenticatedMutationContext {
  const assertSessionCurrent = () => {
    if (envelope.completionSession.sessionBoundaryActive
      || !authenticatedSessionMatches(envelope.completionSession)) {
      throw new StaleAuthenticatedSessionError()
    }
  }
  return {
    ...context,
    sessionSnapshot: envelope.initialSession,
    isSessionCurrent: () => authenticatedSessionMatches(envelope.completionSession),
    assertSessionCurrent,
    adoptSession: (snapshot) => {
      if (!authenticatedSessionMatches(snapshot)) {
        throw new StaleAuthenticatedSessionError()
      }
      envelope.completionSession = snapshot
    },
  }
}

function buildMutationOptions<
  TData,
  TError,
  TVariables,
  TOnMutateResult,
>(
  snapshot: AuthenticatedSessionSnapshot,
  options: UseAuthenticatedMutationOptions<
    TData,
    TError,
    TVariables,
    TOnMutateResult
  >,
): MutationObserverOptions<
  TData,
  TError,
  MutationEnvelope<TData, TError, TVariables, TOnMutateResult>,
  MutationResultEnvelope<TOnMutateResult>
> {
  return {
    mutationKey: authenticatedQueryKeyForSession(
      snapshot,
      options.mutationKey ?? ['mutation'],
    ),
    retry: options.retry,
    retryDelay: options.retryDelay,
    networkMode: options.networkMode,
    gcTime: options.gcTime,
    meta: options.meta,
    scope: options.scope,
    throwOnError: options.throwOnError,
    mutationFn: async (envelope, context) => {
      const authenticatedContext = mutationContext(envelope, context)
      authenticatedContext.assertSessionCurrent()
      return options.mutationFn(envelope.variables, authenticatedContext)
    },
    onMutate: async (envelope, context) => {
      const authenticatedContext = mutationContext(envelope, context)
      authenticatedContext.assertSessionCurrent()
      return {
        onMutateResult: await options.onMutate?.(
          envelope.variables,
          authenticatedContext,
        ),
      }
    },
    onSuccess: async (data, envelope, result, context) => {
      const authenticatedContext = mutationContext(envelope, context)
      if (!authenticatedContext.isSessionCurrent()) return
      await options.onSuccess?.(
        data,
        envelope.variables,
        result?.onMutateResult,
        authenticatedContext,
      )
      if (!authenticatedContext.isSessionCurrent()) return
      await envelope.callbacks?.onSuccess?.(
        data,
        envelope.variables,
        result?.onMutateResult,
        context,
      )
    },
    onError: async (error, envelope, result, context) => {
      const authenticatedContext = mutationContext(envelope, context)
      if (!authenticatedContext.isSessionCurrent()) return
      await options.onError?.(
        error,
        envelope.variables,
        result?.onMutateResult,
        authenticatedContext,
      )
      if (!authenticatedContext.isSessionCurrent()) return
      await envelope.callbacks?.onError?.(
        error,
        envelope.variables,
        result?.onMutateResult,
        context,
      )
    },
    onSettled: async (data, error, envelope, result, context) => {
      const authenticatedContext = mutationContext(envelope, context)
      if (!authenticatedContext.isSessionCurrent()) return
      await options.onSettled?.(
        data,
        error,
        envelope.variables,
        result?.onMutateResult,
        authenticatedContext,
      )
      if (!authenticatedContext.isSessionCurrent()) return
      await envelope.callbacks?.onSettled?.(
        data,
        error,
        envelope.variables,
        result?.onMutateResult,
        context,
      )
    },
  }
}

/**
 * Authenticated mutation fence. Variables/results live in an authenticated
 * MutationCache namespace, every invocation captures its exact session, and
 * local/per-call callbacks are CAS-gated so a late A completion cannot patch B.
 */
export function useAuthenticatedMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: UseAuthenticatedMutationOptions<TData, TError, TVariables, TOnMutateResult>,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const client = useQueryClient()
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  }, [options])

  const [observer] = useState(() => {
    const initialSession = captureAuthenticatedSession()
    return new MutationObserver<
      TData,
      TError,
      MutationEnvelope<TData, TError, TVariables, TOnMutateResult>,
      MutationResultEnvelope<TOnMutateResult>
    >(client, buildMutationOptions(initialSession, options))
  })

  const result = useSyncExternalStore(
    useCallback(
      (onStoreChange) => observer.subscribe(notifyManager.batchCalls(onStoreChange)),
      [observer],
    ),
    () => observer.getCurrentResult(),
    () => observer.getCurrentResult(),
  )

  useLayoutEffect(
    () => registerAuthenticatedPrincipalReset(observer.reset),
    [observer],
  )

  const mutate = useCallback((
    variables: TVariables,
    callbacks?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
  ) => {
    const snapshot = captureAuthenticatedSession()
    observer.setOptions(buildMutationOptions(snapshot, optionsRef.current))
    observer.mutate({
      variables,
      initialSession: snapshot,
      completionSession: snapshot,
      callbacks,
    }).catch(noop)
  }, [observer])

  const mutateAsync = useCallback((
    variables: TVariables,
    callbacks?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
  ) => {
    const snapshot = captureAuthenticatedSession()
    observer.setOptions(buildMutationOptions(snapshot, optionsRef.current))
    return observer.mutate({
      variables,
      initialSession: snapshot,
      completionSession: snapshot,
      callbacks,
    })
  }, [observer])

  if (result.error
    && shouldThrowError(observer.options.throwOnError, [result.error])) {
    throw result.error
  }

  return {
    ...result,
    context: result.context?.onMutateResult,
    variables: result.variables?.variables,
    mutate,
    mutateAsync,
  } as UseMutationResult<TData, TError, TVariables, TOnMutateResult>
}
