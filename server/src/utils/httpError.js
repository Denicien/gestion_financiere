// Erreur métier portant un code HTTP (400, 401, 403, 409...)
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
