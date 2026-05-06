const respond = require('../../utils/respond');

const STATUS_MAP = {
  100: { title: 'Continue', detail: 'The request can continue.' },
  101: { title: 'Switching Protocols', detail: 'The server is switching protocols.' },
  200: { title: 'OK', detail: 'The request succeeded.' },
  201: { title: 'Created', detail: 'A new resource was created.' },
  202: { title: 'Accepted', detail: 'The request was accepted for processing.' },
  204: { title: 'No Content', detail: 'The request succeeded with no response body.' },
  301: { title: 'Moved Permanently', detail: 'The resource has a new permanent URL.' },
  302: { title: 'Found', detail: 'The resource is temporarily somewhere else.' },
  304: { title: 'Not Modified', detail: 'Cached content can still be used.' },
  400: { title: 'Bad Request', detail: 'The request payload or format is invalid.' },
  401: { title: 'Unauthorized', detail: 'Authentication is required.' },
  403: { title: 'Forbidden', detail: 'The server understood the request but refused it.' },
  404: { title: 'Not Found', detail: 'The resource could not be found.' },
  405: { title: 'Method Not Allowed', detail: 'That HTTP method is not allowed here.' },
  409: { title: 'Conflict', detail: 'The request conflicts with the current resource state.' },
  410: { title: 'Gone', detail: 'The resource no longer exists.' },
  413: { title: 'Payload Too Large', detail: 'The request body is too large.' },
  415: { title: 'Unsupported Media Type', detail: 'The server does not accept that content type.' },
  418: { title: "I'm a Teapot", detail: 'A joke status code that still shows up in tooling.' },
  422: { title: 'Unprocessable Content', detail: 'The payload was valid but could not be processed.' },
  429: { title: 'Too Many Requests', detail: 'You hit a rate limit.' },
  500: { title: 'Internal Server Error', detail: 'The server crashed or hit an unexpected condition.' },
  501: { title: 'Not Implemented', detail: 'The server does not support that functionality.' },
  502: { title: 'Bad Gateway', detail: 'An upstream service failed.' },
  503: { title: 'Service Unavailable', detail: 'The server is currently unavailable.' },
  504: { title: 'Gateway Timeout', detail: 'An upstream service took too long to respond.' }
};

function classifyStatus(code) {
  if (code >= 100 && code < 200) return 'Informational';
  if (code >= 200 && code < 300) return 'Success';
  if (code >= 300 && code < 400) return 'Redirect';
  if (code >= 400 && code < 500) return 'Client Error';
  if (code >= 500 && code < 600) return 'Server Error';
  return 'Unknown';
}

module.exports = {
  name: 'httpstatus',
  aliases: ['statuscode'],
  category: 'tools',
  description: 'Explain a HTTP status code.',
  usage: 'httpstatus <code>',
  examples: ['httpstatus 404', 'httpstatus 429'],

  async execute({ message, args }) {
    const raw = String(args[0] || '').trim();
    if (!raw) {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: 'Look up a HTTP status code.',
        fields: [
          { name: 'Usage', value: '`httpstatus <code>`' },
          { name: 'Common Codes', value: '`200` `201` `301` `400` `401` `403` `404` `409` `429` `500` `502` `503`' }
        ]
      });
    }

    const code = Number(raw);
    if (!Number.isInteger(code)) {
      return respond.reply(message, 'bad', 'I need a numeric HTTP status code.');
    }

    const meta = STATUS_MAP[code];
    const family = classifyStatus(code);

    return respond.reply(message, meta ? 'info' : 'bad', null, {
      mentionUser: false,
      description: meta
        ? `**${code} ${meta.title}**`
        : `I do not have a stored explanation for **${code}**, but it falls under **${family}**.`,
      fields: [
        { name: 'Class', value: family, inline: true },
        { name: 'Status', value: String(code), inline: true },
        {
          name: 'Meaning',
          value: meta?.detail || 'This code is not in my quick reference list yet.'
        },
        { name: 'Reference', value: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/${code}` }
      ]
    });
  }
};
