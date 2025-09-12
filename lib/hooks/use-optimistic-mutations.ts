'use client'

import { useCallback, useState } from 'react'
import { createClient } from '../supabase/client'

interface OptimisticMutationOptions<T> {
  table: string
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  revertOnError?: boolean
}

interface MutationState {
  loading: boolean
  error: Error | null
}

export function useOptimisticMutations<T = any>({
  table,
  onSuccess,
  onError,
  revertOnError = true
}: OptimisticMutationOptions<T>) {
  const [state, setState] = useState<MutationState>({
    loading: false,
    error: null
  })

  const supabase = createClient()

  // Optimistic insert
  const insertOptimistic = useCallback(async (
    data: Partial<T>,
    optimisticUpdate?: (tempData: T) => void,
    revertUpdate?: () => void
  ) => {
    setState({ loading: true, error: null })

    // Generate temporary ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random()}`
    const tempData = { ...data, id: tempId } as T

    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate(tempData)
    }

    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select()
        .single()

      if (error) throw error

      setState({ loading: false, error: null })
      onSuccess?.(result)

      return result
    } catch (error) {
      // Revert optimistic update on error
      if (revertOnError && revertUpdate) {
        revertUpdate()
      }

      const err = error as Error
      setState({ loading: false, error: err })
      onError?.(err)
      throw err
    }
  }, [table, onSuccess, onError, revertOnError, supabase])

  // Optimistic update
  const updateOptimistic = useCallback(async (
    id: string | number,
    updates: Partial<T>,
    optimisticUpdate?: (updatedData: Partial<T>) => void,
    revertUpdate?: (originalData: Partial<T>) => void
  ) => {
    setState({ loading: true, error: null })

    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate(updates)
    }

    // Store original data for potential revert
    let originalData: any = null
    if (revertOnError && revertUpdate) {
      const { data: current } = await supabase
        .from(table)
        .select()
        .eq('id', id)
        .single()
      originalData = current
    }

    try {
      const { data: result, error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      setState({ loading: false, error: null })
      onSuccess?.(result)

      return result
    } catch (error) {
      // Revert optimistic update on error
      if (revertOnError && revertUpdate && originalData) {
        revertUpdate(originalData)
      }

      const err = error as Error
      setState({ loading: false, error: err })
      onError?.(err)
      throw err
    }
  }, [table, onSuccess, onError, revertOnError, supabase])

  // Optimistic delete
  const deleteOptimistic = useCallback(async (
    id: string | number,
    optimisticUpdate?: () => void,
    revertUpdate?: (data: T) => void
  ) => {
    setState({ loading: true, error: null })

    // Get data before delete for potential revert
    let originalData: T | null = null
    if (revertOnError && revertUpdate) {
      const { data: current } = await supabase
        .from(table)
        .select()
        .eq('id', id)
        .single()
      originalData = current
    }

    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate()
    }

    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id)

      if (error) throw error

      setState({ loading: false, error: null })
      onSuccess?.(null as any)

      return true
    } catch (error) {
      // Revert optimistic update on error
      if (revertOnError && revertUpdate && originalData) {
        revertUpdate(originalData)
      }

      const err = error as Error
      setState({ loading: false, error: err })
      onError?.(err)
      throw err
    }
  }, [table, onSuccess, onError, revertOnError, supabase])

  return {
    ...state,
    insertOptimistic,
    updateOptimistic,
    deleteOptimistic
  }
}