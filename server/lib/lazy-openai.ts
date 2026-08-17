import OpenAI from "openai";

/**
 * A lazily-constructed OpenAI client.
 *
 * The SDK throws from its constructor when no API key is resolvable. Building a
 * client at module scope therefore turns one missing optional key into a crash
 * during import — before any route is registered and before the port is bound.
 * On a deployment that surfaces only as "built successfully but failed to
 * start", with no indication of which integration was responsible.
 *
 * This defers construction until the client is first *used*, so a missing key
 * breaks the AI feature that needed it and nothing else. Call sites are
 * unchanged: `openai.chat.completions.create(...)` still reads the same,
 * because the proxy forwards property access to the real client on first touch.
 */
export function lazyOpenAI(options: ConstructorParameters<typeof OpenAI>[0] = {}): OpenAI {
  let client: OpenAI | null = null;

  const resolve = (): OpenAI => {
    if (!client) client = new OpenAI(options);
    return client;
  };

  return new Proxy({} as OpenAI, {
    get(_target, prop, receiver) {
      const value = Reflect.get(resolve() as object, prop, receiver);
      // Methods must stay bound to the real client, not the proxy.
      return typeof value === "function" ? value.bind(resolve()) : value;
    },
    set(_target, prop, value) {
      return Reflect.set(resolve() as object, prop, value);
    },
    has(_target, prop) {
      return Reflect.has(resolve() as object, prop);
    },
  });
}

/**
 * True when an OpenAI key is configured, without constructing a client.
 *
 * Lets a caller degrade gracefully ("AI summary unavailable") instead of
 * discovering the problem as a thrown constructor mid-request.
 */
export function hasOpenAIKey(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  );
}
