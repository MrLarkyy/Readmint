import { describe, expect, test } from "vitest";
import { ActionLog } from "../src/ActionLog.js";

function logged(use: (log: ActionLog) => void, secrets: readonly string[] = []): string {
  let text = "";
  use(
    new ActionLog((chunk) => {
      text += chunk;
    }, secrets),
  );
  return text;
}

const esc = (code: number) => `\\u${code.toString(16).padStart(4, "0")}`;

describe("ActionLog", () => {
  test("a line that would start a workflow command is printed inert", () => {
    expect(
      logged((log) => {
        log.info("::set-output name=x::y");
      }),
    ).toBe(`${esc(0x3a)}:set-output name=x::y\n`);
    expect(
      logged((log) => {
        log.info("  ::error::x");
      }),
    ).toBe(`  ${esc(0x3a)}:error::x\n`);
  });

  test("the legacy ##[ command form is escaped anywhere in a line", () => {
    expect(
      logged((log) => {
        log.info("a ##[error]b");
      }),
    ).toBe(`a ${esc(0x23)}#[error]b\n`);
  });

  test("control and format characters are escaped, so one line stays one line", () => {
    const text = `a\nb\rc${String.fromCharCode(0x1b)}[31m${String.fromCharCode(0x202e)}`;
    expect(
      logged((log) => {
        log.info(text);
      }),
    ).toBe(`a${esc(10)}b${esc(13)}c${esc(0x1b)}[31m${esc(0x202e)}\n`);
  });

  test("percent signs in a command message are encoded as the runner decodes them", () => {
    expect(
      logged((log) => {
        log.error("100%0A done");
      }),
    ).toBe("::error::100%250A done\n");
    expect(
      logged((log) => {
        log.warning("50%");
      }),
    ).toBe("::warning::50%25\n");
  });

  test("groups wrap their lines; every line is cleaned", () => {
    expect(
      logged((log) => {
        log.group("t%", ["::x", "y"]);
      }),
    ).toBe(`::group::t%25\n${esc(0x3a)}:x\ny\n::endgroup::\n`);
  });

  test("secrets and their base64 forms are redacted, short secrets ignored", () => {
    const secret = "s3cr3t-value";
    const base64 = Buffer.from(secret).toString("base64");
    const basic = Buffer.from(`x-access-token:${secret}`).toString("base64");
    expect(
      logged(
        (log) => {
          log.info(`${secret} ${base64} Basic ${basic} ab`);
        },
        [secret, "ab"],
      ),
    ).toBe("*** *** Basic *** ab\n");
  });
});
