/** Why a value of an answer or a cache entry was refused; the caller turns it into its own error or a miss. */
export class WakaTimeShapeError extends Error {
  constructor(what: string) {
    super(what);
    this.name = "WakaTimeShapeError";
  }
}
