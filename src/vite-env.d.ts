/// <reference types="svelte" />
/// <reference types="vite/client" />

// Injected by vite.config.ts at build time. __VERSION__ = v<count>,
// __COMMIT__ = short SHA (linked-to from the version badge).
declare const __COMMIT__: string;
declare const __VERSION__: string;
