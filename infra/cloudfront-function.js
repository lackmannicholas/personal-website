// CloudFront Function (viewer request, cloudfront-js-2.0).
// 1. Sends every non-canonical hostname (www, .io, .me, .info, lackman.*) to https://nicklackman.com with a 301.
// 2. Serves index.html for directory-style paths, e.g. /for/netflix/ -> /for/netflix/index.html.
var CANONICAL_HOST = 'nicklackman.com';

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';

  if (host !== CANONICAL_HOST) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + CANONICAL_HOST + request.uri } }
    };
  }

  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') <= uri.lastIndexOf('/')) {
    // No file extension in the last segment: treat it as a directory.
    request.uri = uri + '/index.html';
  }
  return request;
}
