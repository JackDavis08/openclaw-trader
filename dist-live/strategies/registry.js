/**
 * Strategy Registry (F4)
 *
 * Maintains an id -> Strategy mapping for signal-engine and script queries.
 */
const _registry = new Map();
/**
 * Register a strategy plugin. Re-registering the same id overwrites (convenient for testing).
 */
export function registerStrategy(s) {
    _registry.set(s.id, s);
}
/**
 * Get a strategy by id. Throws an error if not found.
 */
export function getStrategy(id) {
    const s = _registry.get(id);
    if (!s) {
        throw new Error(`Strategy "${id}" not found. Registered: ${[..._registry.keys()].join(", ") || "(none)"}`);
    }
    return s;
}
/**
 * List all registered strategy ids.
 */
export function listStrategies() {
    return [..._registry.keys()];
}
/**
 * List all registered strategy details (including name/description).
 */
export function listStrategyDetails() {
    return [..._registry.values()].map((s) => ({
        id: s.id,
        name: s.name,
        ...(s.description !== undefined ? { description: s.description } : {}),
    }));
}
