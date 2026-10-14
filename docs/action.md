# GitHub Action

The Readmint Action renders your designs in your own repository, on a schedule or on demand, and commits the SVG files
that changed. It uses the same loaders and renderer as `readmint render` ([cli.md](cli.md)): for the same design,
assets and data the Action writes byte for byte what the CLI prints.

## Example workflow

```yaml
name: Readmint

on:
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: readmint
  cancel-in-progress: false

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: MrLarkyy/Readmint@vX.Y.Z
        with:
          designs: |
            readmint/designs/card.yaml
            readmint/designs/languages.yaml
```

Use an exact release tag (`vX.Y.Z`); see [Releases](#releases). Then put the printed snippet (below) into your README.

## Inputs

| input            | default                          | meaning                                                                                                                                    |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `designs`        | (required)                       | design files, one per line, relative to the workspace; blank lines are ignored; 1 to 64                                                    |
| `output-dir`     | `readmint`                       | folder inside the workspace the SVG files go to; created when missing                                                                      |
| `formats`        | `svg`                            | output formats, comma or newline separated; only `svg` until raster export exists, anything else is an input error                         |
| `token`          | `${{ github.token }}`            | token for the GitHub data; not used with `data-file`; never printed and never given to git                                                 |
| `login`          | `${{ github.repository_owner }}` | the GitHub user whose data is loaded; needed with `GITHUB_TOKEN`, which belongs to no user                                                 |
| `data-file`      | none                             | fixture data JSON (the CLI `--data` format) used instead of loading GitHub data: no token, no network                                      |
| `locale`         | none                             | BCP 47 tag for the `number`, `compact`, `percent` and `date` filters, as the CLI `--locale`; none keeps the renderer's default, as the CLI |
| `commit-message` | `Update Readmint graphics`       | message of the commit; at most 4096 characters                                                                                             |
| `branch`         | the checked-out branch           | branch the commit is pushed to; required when the checkout is a detached HEAD                                                              |
| `dry-run`        | `false`                          | `true` renders and writes the files but runs no git command                                                                                |

Booleans are YAML core booleans: `true`, `True`, `TRUE`, `false`, `False`, `FALSE`. A blank input takes its default.
Every problem with the inputs is reported at once, before anything is rendered.

## Outputs

| output    | value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `changed` | `true` when an output file differs from the last commit (in a dry run: when a file in the workspace changed) |
| `commit`  | SHA of the pushed commit; empty when nothing was committed and in a dry run                                  |
| `files`   | the changed output files, one per line, relative to the workspace                                            |
| `snippet` | the `<picture>` HTML for every design, also printed in the log group `README snippet`                        |

## Outputs on disk and the dark variant

A design `card.yaml` is written to `<output-dir>/card.svg`: the file name without its last extension, plus `.svg`. Two
designs that would write the same file (also when only the letter case differs) are an input error.

A design file `card.dark.yaml` next to `card.yaml` (same folder, same extension) is its dark variant: it is rendered
too, to `<output-dir>/card.dark.svg`, and the snippet switches to it when the reader's system is in dark mode. It is a
design like any other; nothing in the design format or the renderer knows about light or dark. You do not need to
list it; if you do, list its light design too, else it is an input error.

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/card.dark.svg" />
  <img alt="card" src="readmint/card.svg" />
</picture>
```

Paths in the snippet are relative to the repository root (where the README is), each segment percent-encoded.

Outputs of designs you remove from the list are not deleted.

## What a run does

1. Reads and checks the inputs, then pairs the designs with their outputs.
2. Unless it is a dry run: finds the branch to push to and checks its name, before anything is written.
3. Loads the data once: the `data-file`, else the GitHub data of `login`, bound as `github` (see
   [data-github.md](data-github.md)). The load is given 5 minutes.
4. Loads and renders every design and dark variant. Design files and their assets are read only inside the workspace,
   also through links ([asset-loading.md](asset-loading.md)). If any design fails, nothing is written and the run
   fails: the output set is never half updated.
5. Writes each output whose bytes differ from the file already there (a file with the same bytes is not touched).
   The output folder must resolve inside the workspace and an existing output must be a regular file, not a link or a
   folder; this is checked before the first write.
6. Prints the snippet.
7. Unless it is a dry run: stages the output files and, when any differs from the last commit, commits only those
   files (anything else you staged in an earlier step stays staged and out of the commit) as `github-actions[bot]`
   and pushes the commit to `origin`. A second run over unchanged designs and data makes no commit.

Renderer warnings are printed as `::warning::` lines and do not fail the run.

## Data and the token

By default the Action loads the data of the repository owner with the workflow's `GITHUB_TOKEN`. That token belongs
to no user, so `login` is needed (its default is the repository owner) and the data is what the token may see. With a
personal access token in a secret (`token: ${{ secrets.READMINT_TOKEN }}`), the data can include contribution counts
of private repositories; in a public repository they are then published in the SVG. See
[data-github.md](data-github.md#repositories-and-privacy) before you use a personal token. The owner must be a user;
an organisation login fails to load.

The token is used for the GitHub data only. It is never printed: log lines, errors and step outputs are redacted (also
its base64 forms), and the GitHub loader never puts it into an error. It is never given to git, neither as an
argument nor in git's environment.

## Pushing

The push uses the credentials `actions/checkout` stores in the repository, so:

- keep `persist-credentials` of the checkout on (its default) and give the job `permissions: contents: write`;
- check the repository out into the workspace root (no `path:`), since git runs there;
- the push goes to `origin`, to `branch` or the checked-out branch; a branch that moved since the checkout rejects the
  push and the run fails: nothing is rebased or forced. A `concurrency` group keeps two runs from racing;
- a push made with `GITHUB_TOKEN` starts no other workflow, so the commit does not trigger your other workflows.

On Windows runners git may convert line ends; a `.gitattributes` line such as `readmint/*.svg -text` keeps the SVG
bytes as written. The Action compares with the last commit after staging, so a line-end conversion alone never
makes a commit.

## Dry run

With `dry-run: true` the Action renders and writes the changed files into the workspace, prints
`dry run: would commit <n> file(s)` and sets the outputs (`commit` empty), but runs no git command at all: nothing is
staged, committed or pushed, and the workspace need not be a git repository. Use it to inspect the result, for
example with `actions/upload-artifact`.

## Errors

A failed run exits with 1 and prints one `::error::` line per problem, each naming what it is about:

- inputs: a missing or invalid input (all at once);
- data: the fixture file's problem, or `GitHub data (<code>): <message>` with the code of
  [data-github.md](data-github.md#errors);
- render: the design's issues, as `readmint render` prints them;
- output: an output folder outside the workspace, an output that is not a regular file, a file that cannot be written;
- git: the git command that failed and the last 20 lines of what it printed.

Every line is escaped: a design or data value cannot end the line, start a workflow command or colour the log.
Anything unexpected prints only `internal error (<name>)`.

## Releases

The bundle (`packages/action/dist/action.js`) is not in the main branch. The `Release Action` workflow
(`workflow_dispatch` with a `version` such as `v0.1.0`) builds it on `main`, commits it on a detached commit and
pushes a new tag that points there. It never moves or overwrites a tag, so a tag always runs the same code. The
Action is version 0: an added input or output is compatible, a renamed or removed one is a new major version.
