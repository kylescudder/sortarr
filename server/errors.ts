export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message)
  }
}
