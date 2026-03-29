/**
 * Strategy Plugin Interface Definition (F4)
 *
 * Abstracts signal logic into pluggable strategy plugins, coexisting with existing config-driven logic:
 *   - strategy_id: "default" -> uses existing YAML condition matching logic (behavior unchanged)
 *   - strategy_id: "rsi-reversal" | "breakout" | custom -> uses plugin logic
 */
export {};
