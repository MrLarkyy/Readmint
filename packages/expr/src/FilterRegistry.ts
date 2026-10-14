import { dateFilters } from "./dateFilters.js";
import type { FilterDefinition } from "./FilterDefinition.js";
import { generalFilters } from "./generalFilters.js";
import { numberFilters } from "./numberFilters.js";
import { stringFilters } from "./stringFilters.js";

/**
 * Every filter by name. A `Map`, so a name like `constructor` or `__proto__` finds nothing instead
 * of something inherited from `Object.prototype`.
 */
export const filterRegistry: ReadonlyMap<string, FilterDefinition> = new Map(
  [numberFilters, dateFilters, stringFilters, generalFilters].flatMap((group) =>
    Object.entries(group),
  ),
);
