import { applyDesignProps } from "./applyDesignProps.js";
import type { Design } from "./Design.js";
import type { DesignResult } from "./DesignResult.js";
import type { RenderVariant } from "./RenderVariant.js";

/**
 * The design with the variant's props set on its top-level component layers (`applyDesignProps`), validated again.
 * A message never quotes a value; each starts with `variant <name>: `.
 */
export function applyRenderVariant(design: Design, variant: RenderVariant): DesignResult<Design> {
  const result = applyDesignProps(design, variant.props);
  if (result.ok) return result;
  return {
    ...result,
    issues: result.issues.map((issue) => ({
      ...issue,
      message: `variant ${variant.name}: ${issue.message}`,
    })),
  };
}
