import { around } from "monkey-around"
import { Plugin } from "obsidian"

// Is any
type IsAny<T> = 0 extends 1 & T ? true : false
type NotAny<T> = IsAny<T> extends true ? never : T

// All keys in T that are functions
type FunctionKeys<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]

// The type of the function at key K in T
type KeyFunction<T, K extends FunctionKeys<T>> =
    T[K] extends (...args: any[]) => any ? T[K] : never

// The type of a patch function for key K in T
type KeyFunctionReplacement<T, K extends FunctionKeys<T>, R extends ReturnType<KeyFunction<T, K>>> =
    (this: T, ...args: Parameters<KeyFunction<T, K>>) => IsAny<ReturnType<KeyFunction<T, K>>> extends false
        ? ReturnType<KeyFunction<T, K>> & NotAny<R>
        : any

// The wrapper of a patch function for key K in T
type PatchFunctionWrapper<T, K extends FunctionKeys<T>, R extends ReturnType<KeyFunction<T, K>>> =
    (next: KeyFunction<T, K>) => KeyFunctionReplacement<T, K, R>

// The object of patch functions for T
type FunctionPatchObject<T> = {
    [K in FunctionKeys<T>]?: PatchFunctionWrapper<T, K, ReturnType<KeyFunction<T, K>>> & { __overrideExisting?: boolean }
}

export default class PatchHelper {
    static OverrideExisting<T, K extends FunctionKeys<T>, R extends ReturnType<KeyFunction<T, K>>>(
        fn: PatchFunctionWrapper<T, K, R> & { __overrideExisting?: boolean }
    ) { return Object.assign(fn, { __overrideExisting: true }) }

    static tryPatchWorkspacePrototype<T>(plugin: Plugin, getTarget: () => T | undefined, functions: { [key: string]: (next: any) => (...args: any) => any }): Promise<T> {
        return new Promise((resolve) => {
            const tryPatch = () => {
                const target = getTarget()
                if (!target) return null

                const uninstaller = around(target.constructor.prototype, functions)
                plugin.register(uninstaller)

                return target
            }

            const result = tryPatch()
            if (result) {
                resolve(result)
                return
            }

            const listener = plugin.app.workspace.on('layout-change', () => {
                const result = tryPatch()

                if (result) {
                    plugin.app.workspace.offref(listener)
                    resolve(result)
                }
            })

            plugin.registerEvent(listener)
        })
    }

    static patchObjectPrototype<T>(plugin: Plugin, target: T, functions: { [key: string]: (next: any) => (...args: any) => any }): void {
        const uninstaller = around((target as any).constructor.prototype, functions)
        plugin.register(uninstaller)
    }

    static patchObjectInstance<T>(plugin: Plugin, target: T, functions: { [key: string]: (next: any) => (...args: any) => any }): void {
        const uninstaller = around(target as any, functions)
        plugin.register(uninstaller)
    }

    static patchPrototype<T>(
        plugin: Plugin,
        target: T | undefined,
        patches: FunctionPatchObject<T>
    ): T | null {
        return PatchHelper.patch(plugin, target, patches, true)
    }

    static patch<T>(
        plugin: Plugin,
        object: T | undefined,
        patches: FunctionPatchObject<T>,
        prototype: boolean = false
    ): T | null {
        if (!object) return null
        const target = prototype ? object.constructor.prototype : object

        // Validate override requirements
        for (const key of Object.keys(patches) as Array<FunctionKeys<T>>) {
            const patch = patches[key]
            if (patch?.__overrideExisting) {
                if (typeof target[key] !== 'function')
                    throw new Error(`Method ${String(key)} does not exist on target`)
            }
        }

        const uninstaller = around(target as any, patches)
        plugin.register(uninstaller)

        return object
    }
}