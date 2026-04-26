const respond = require('../../utils/respond');

module.exports = {
  name: 'httpstatus',
  aliases: ["statuscode"],
  category: 'tools',
  description: "Explains common HTTP status codes.",
  usage: "httpstatus <code>",
  examples: ["httpstatus <code>"],

  async execute({ message, args }) {
    const code = String(args[0] || '');
    const map = {
      200: 'OK — the request succeeded.',
      201: 'Created — a resource was created.',
      204: 'No Content — success without a response body.',
      301: 'Moved Permanently — the resource moved.',
      302: 'Found — temporary redirect.',
      400: 'Bad Request — the request is invalid.',
      401: 'Unauthorized — authentication is needed.',
      403: 'Forbidden — access is denied.',
      404: 'Not Found — resource not found.',
      409: 'Conflict — request conflicts with current state.',
      429: 'Too Many Requests — rate limited.',
      500: 'Internal Server Error — server crashed.',
      502: 'Bad Gateway — upstream failed.',
      503: 'Service Unavailable — server unavailable.'
    };
    return respond.reply(message, map[code] ? 'info' : 'bad', map[code] || 'do not know that status code.');
  }
};
