export interface FakeModelContextOptions {
  readonly failAfter?: number
  readonly failureName?: string
}

/**
 * Installs a page-local WebMCP-shaped registry. Tool callbacks stay in the
 * browser, while the small registry state is readable from page.evaluate.
 */
export const fakeModelContextInitScript = (
  options: FakeModelContextOptions = {},
): string => {
  const failAfter = options.failAfter ?? null
  const failureName = options.failureName ?? 'RegistrationError'

  return `(() => {
    const state = {
      tools: Object.create(null),
      registrations: [],
      failAfter: ${JSON.stringify(failAfter)},
      failureName: ${JSON.stringify(failureName)},
    };
    const context = {
      registerTool(tool, registrationOptions) {
        if (state.failAfter !== null && state.registrations.length >= state.failAfter) {
          const error = new Error('The fake model context rejected this registration.');
          error.name = state.failureName;
          return Promise.reject(error);
        }

        state.registrations.push({ name: tool.name, signal: registrationOptions.signal });
        state.tools[tool.name] = tool;
        registrationOptions.signal.addEventListener('abort', () => {
          if (state.tools[tool.name] === tool) {
            delete state.tools[tool.name];
          }
        }, { once: true });
        return Promise.resolve(undefined);
      },
    };

    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: context,
    });
    globalThis.__wattkeepFakeModelContext = state;
  })()`
}
