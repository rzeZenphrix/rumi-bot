function safeMessage(error) {
  return String(error?.message || error?.code || error || 'Unknown error');
}

function classifyNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = safeMessage(error).toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);

  if (code === 'ENOTFOUND' || message.includes('getaddrinfo enotfound')) {
    return {
      type: 'dns_failure',
      retryable: true,
      userMessage: 'DNS lookup failed. Check your internet connection and hostnames.'
    };
  }

  if (code === 'ECONNREFUSED' || message.includes('econnrefused')) {
    return {
      type: 'connection_refused',
      retryable: true,
      userMessage: 'The remote service refused the connection.'
    };
  }

  if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
    return {
      type: 'timeout',
      retryable: true,
      userMessage: 'The remote service timed out.'
    };
  }

  if (message.includes('fetch failed') || message.includes('network')) {
    return {
      type: 'network_unreachable',
      retryable: true,
      userMessage: 'Network request failed. Check your internet connection.'
    };
  }

  if (status === 401 || status === 403 || message.includes('invalid api key') || message.includes('jwt')) {
    return {
      type: 'invalid_credentials',
      retryable: false,
      userMessage: 'Credentials were rejected. Check the configured API key or service role key.'
    };
  }

  if (status >= 500) {
    return {
      type: 'remote_service_error',
      retryable: true,
      userMessage: 'The remote service is temporarily failing.'
    };
  }

  return {
    type: 'unknown_error',
    retryable: false,
    userMessage: safeMessage(error)
  };
}

function redactSecretText(value) {
  return String(value || '')
    .replace(/postgresql:\/\/[^\s]+/gi, 'postgresql://[redacted]')
    .replace(/eyJ[a-zA-Z0-9._-]+/g, '[redacted-jwt]')
    .replace(/(service_role_key|token|password|apikey|api_key)=([^\s&]+)/gi, '$1=[redacted]');
}

module.exports = {
  classifyNetworkError,
  redactSecretText
};
