/**
 * DevProbe — Security & API Execution Configuration
 *
 * Day 4: Backend Architecture & Safe Request Validation
 *
 * IMPORTANT SECURITY ARCHITECTURE NOTE:
 * Validating a URL string on the server at request-configuration time is an essential
 * first layer of defense against SSRF, but hostname/URL validation alone is INSUFFICIENT
 * to prevent SSRF or DNS-rebinding attacks when outbound requests are dispatched.
 *
 * For Day 5 execution, the outbound request engine MUST:
 * 1. Resolve hostnames via DNS immediately prior to connection.
 * 2. Validate that the resolved IP address is neither private, loopback, multicast,
 *    nor link-local before initiating TCP/TLS handshakes.
 * 3. Pin connections to the validated IP to prevent DNS rebinding.
 * 4. Re-validate destination addresses on every HTTP redirect.
 * 5. Strictly enforce response size limits and connection/read timeouts.
 */

const net = require('net');

/**
 * Execution Limits & Defaults (for Day 4 validation & Day 5 execution)
 */
const EXECUTION_LIMITS = {
  DEFAULT_TIMEOUT_MS: 10000,           // 10 seconds default
  MAX_TIMEOUT_MS: 30000,               // 30 seconds maximum
  MAX_RESPONSE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB maximum response size
  MAX_REDIRECTS: 5,                    // Maximum 5 redirects permitted
  MAX_REQUEST_BODY_SIZE_BYTES: 1024 * 1024, // 1 MB max request body payload
  BODY_SIZE_LIMIT_EXPRESS: '1mb'       // Express body parser limit
};

/**
 * Permitted HTTP Methods for DevProbe testing
 */
const ALLOWED_HTTP_METHODS = Object.freeze([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
]);

/**
 * Permitted Protocols for DevProbe testing (strictly HTTP & HTTPS)
 */
const ALLOWED_PROTOCOLS = Object.freeze([
  'http:',
  'https:'
]);

/**
 * Sensitive HTTP Headers whose values must NEVER be logged or returned in responses
 */
const SENSITIVE_HEADERS = Object.freeze(new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'apikey',
  'secret',
  'token',
  'x-csrf-token',
  'x-xsrf-token'
]));

/**
 * Prohibited Hostname Suffixes and exact matches
 */
const PROHIBITED_HOSTNAMES = Object.freeze([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata'
]);

const PROHIBITED_DOMAIN_SUFFIXES = Object.freeze([
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home.arpa'
]);

/**
 * Specific prohibited IPs (e.g. cloud metadata services)
 */
const PROHIBITED_SPECIFIC_IPS = Object.freeze([
  '169.254.169.254',  // AWS, GCP, Azure, DigitalOcean IMDS
  '100.100.100.200'   // Alibaba Cloud IMDS
]);

/**
 * Check if 4 IPv4 octets fall into private, loopback, link-local, multicast, or reserved ranges
 * @param {number[]} octets - 4 numbers in range 0-255
 * @returns {{ isPrivate: boolean, reason?: string }}
 */
function isPrivateOrReservedIPv4(octets) {
  const [o1, o2, o3, o4] = octets;

  // 0.0.0.0/8 - Current network ("this host on this network")
  if (o1 === 0) {
    return { isPrivate: true, reason: 'Unspecified/current network address (0.0.0.0/8)' };
  }

  // 127.0.0.0/8 - Loopback
  if (o1 === 127) {
    return { isPrivate: true, reason: 'Loopback address (127.0.0.0/8)' };
  }

  // 10.0.0.0/8 - Private Class A
  if (o1 === 10) {
    return { isPrivate: true, reason: 'Private Class A network (10.0.0.0/8)' };
  }

  // 172.16.0.0/12 - Private Class B (172.16.0.0 - 172.31.255.255)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) {
    return { isPrivate: true, reason: 'Private Class B network (172.16.0.0/12)' };
  }

  // 192.168.0.0/16 - Private Class C
  if (o1 === 192 && o2 === 168) {
    return { isPrivate: true, reason: 'Private Class C network (192.168.0.0/16)' };
  }

  // 169.254.0.0/16 - Link-local / Cloud metadata (includes 169.254.169.254)
  if (o1 === 169 && o2 === 254) {
    return { isPrivate: true, reason: 'Link-local / cloud metadata address (169.254.0.0/16)' };
  }

  // 100.64.0.0/10 - Shared address space / Carrier-Grade NAT (100.64.0.0 - 100.127.255.255)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) {
    return { isPrivate: true, reason: 'Carrier-Grade NAT private address space (100.64.0.0/10)' };
  }

  // 192.0.0.0/24 - IETF Protocol Assignments
  if (o1 === 192 && o2 === 0 && o3 === 0) {
    return { isPrivate: true, reason: 'IETF Protocol Assignments (192.0.0.0/24)' };
  }

  // 192.0.2.0/24 - TEST-NET-1 (Documentation)
  if (o1 === 192 && o2 === 0 && o3 === 2) {
    return { isPrivate: true, reason: 'Documentation network TEST-NET-1 (192.0.2.0/24)' };
  }

  // 198.18.0.0/15 - Benchmark testing (198.18.0.0 - 198.19.255.255)
  if (o1 === 198 && (o2 === 18 || o2 === 19)) {
    return { isPrivate: true, reason: 'Benchmark testing address space (198.18.0.0/15)' };
  }

  // 198.51.100.0/24 - TEST-NET-2 (Documentation)
  if (o1 === 198 && o2 === 51 && o3 === 100) {
    return { isPrivate: true, reason: 'Documentation network TEST-NET-2 (198.51.100.0/24)' };
  }

  // 203.0.113.0/24 - TEST-NET-3 (Documentation)
  if (o1 === 203 && o2 === 0 && o3 === 113) {
    return { isPrivate: true, reason: 'Documentation network TEST-NET-3 (203.0.113.0/24)' };
  }

  // 224.0.0.0/4 - Multicast (224.0.0.0 - 239.255.255.255)
  if (o1 >= 224 && o1 <= 239) {
    return { isPrivate: true, reason: 'Multicast address space (224.0.0.0/4)' };
  }

  // 240.0.0.0/4 - Reserved for future use & Broadcast (includes 255.255.255.255)
  if (o1 >= 240) {
    return { isPrivate: true, reason: 'Reserved / Broadcast address space (240.0.0.0/4)' };
  }

  return { isPrivate: false };
}

/**
 * Expand and parse IPv6 address into 8 16-bit integer words
 * @param {string} ip - IPv6 string without brackets
 * @returns {number[]|null} Array of 8 16-bit words or null if invalid
 */
function expandIPv6(ip) {
  let normalized = ip.toLowerCase();

  // Handle embedded IPv4 notation in IPv6 (e.g. ::ffff:192.0.2.1)
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4Str = normalized.slice(lastColon + 1);
    const v4Parts = v4Str.split('.').map(Number);
    if (v4Parts.length !== 4 || v4Parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return null;
    }
    const hex1 = ((v4Parts[0] << 8) | v4Parts[1]).toString(16);
    const hex2 = ((v4Parts[2] << 8) | v4Parts[3]).toString(16);
    normalized = normalized.slice(0, lastColon + 1) + hex1 + ':' + hex2;
  }

  const parts = normalized.split('::');
  if (parts.length > 2) return null; // Invalid multiple '::'

  let head = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  let tail = parts[1] ? parts[1].split(':').filter(Boolean) : [];

  if (parts.length === 1 && head.length !== 8) return null;

  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;

  const middle = new Array(missing).fill('0');
  const fullHex = [...head, ...middle, ...tail];

  if (fullHex.length !== 8) return null;

  return fullHex.map(h => parseInt(h || '0', 16));
}

/**
 * Check if parsed IPv6 words fall into private, loopback, link-local, multicast, or reserved ranges
 * @param {number[]} words - 8 16-bit words
 * @returns {{ isPrivate: boolean, reason?: string }}
 */
function isPrivateOrReservedIPv6(words) {
  // ::1 (Loopback)
  if (
    words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 &&
    words[4] === 0 && words[5] === 0 && words[6] === 0 && words[7] === 1
  ) {
    return { isPrivate: true, reason: 'IPv6 loopback address (::1)' };
  }

  // :: (Unspecified)
  if (words.every(w => w === 0)) {
    return { isPrivate: true, reason: 'IPv6 unspecified address (::)' };
  }

  // IPv4-mapped IPv6 (::ffff:0:0/96) or IPv4-compatible (::0:0/96)
  const isIPv4Mapped = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 &&
                       words[4] === 0 && words[5] === 0xffff;
  const isIPv4Compatible = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 &&
                           words[4] === 0 && words[5] === 0;

  if (isIPv4Mapped || isIPv4Compatible) {
    const octet1 = (words[6] >> 8) & 0xff;
    const octet2 = words[6] & 0xff;
    const octet3 = (words[7] >> 8) & 0xff;
    const octet4 = words[7] & 0xff;
    const v4Check = isPrivateOrReservedIPv4([octet1, octet2, octet3, octet4]);
    if (v4Check.isPrivate) {
      return { isPrivate: true, reason: `IPv4-mapped/compatible destination rejected: ${v4Check.reason}` };
    }
  }

  // Unique local addresses (fc00::/7) - includes fc00:: and fd00::
  const firstWord = words[0];
  if ((firstWord & 0xfe00) === 0xfc00) {
    return { isPrivate: true, reason: 'IPv6 Unique Local Address private space (fc00::/7)' };
  }

  // Link-local unicast (fe80::/10)
  if ((firstWord & 0xffc0) === 0xfe80) {
    return { isPrivate: true, reason: 'IPv6 Link-Local Unicast address (fe80::/10)' };
  }

  // Multicast (ff00::/8)
  if ((firstWord & 0xff00) === 0xff00) {
    return { isPrivate: true, reason: 'IPv6 Multicast address (ff00::/8)' };
  }

  // Discard prefix (100::/64)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
    return { isPrivate: true, reason: 'IPv6 Discard Prefix (100::/64)' };
  }

  // Documentation prefix (2001:db8::/32)
  if (words[0] === 0x2001 && words[1] === 0x0db8) {
    return { isPrivate: true, reason: 'IPv6 Documentation prefix (2001:db8::/32)' };
  }

  return { isPrivate: false };
}

/**
 * Validates a target URL against SSRF and security constraints
 * @param {string} rawUrl - The target URL string
 * @param {object} [options]
 * @param {boolean} [options.allowLocal=false] - If true, bypasses localhost check (strictly controlled dev flag)
 * @returns {{ isValid: boolean, error?: string, parsedUrl?: URL }}
 */
function validateTargetUrl(rawUrl, options = {}) {
  const allowLocal = options.allowLocal ?? (process.env.DEVPROBE_ALLOW_LOCAL_TARGETS === 'true');

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isValid: false, error: 'Target URL must be a non-empty string' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    return { isValid: false, error: `Invalid URL format: ${err.message}` };
  }

  // 1. Validate Protocol (strictly http: or https:)
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      isValid: false,
      error: `Unsupported protocol '${parsed.protocol}'. Only 'http:' and 'https:' are permitted.`
    };
  }

  // 2. Reject embedded URL credentials (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: 'URLs with embedded credentials (username:password@...) are prohibited for security reasons.'
    };
  }

  // Extract hostname (strip bracket enclosures if IPv6 literal)
  let hostname = parsed.hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname) {
    return { isValid: false, error: 'URL must contain a valid hostname' };
  }

  const lowerHostname = hostname.toLowerCase();

  // If local targets are explicitly enabled for development testing, skip SSRF host checks
  if (allowLocal) {
    return { isValid: true, parsedUrl: parsed };
  }

  // 3. Reject Known Prohibited Hostnames and Domains
  if (PROHIBITED_HOSTNAMES.includes(lowerHostname)) {
    return {
      isValid: false,
      error: `Access to prohibited hostname '${hostname}' is blocked for SSRF protection.`
    };
  }

  for (const suffix of PROHIBITED_DOMAIN_SUFFIXES) {
    if (lowerHostname.endsWith(suffix)) {
      return {
        isValid: false,
        error: `Access to local/internal domain '${hostname}' is blocked for SSRF protection.`
      };
    }
  }

  // 4. Reject Specific Cloud Metadata IPs
  if (PROHIBITED_SPECIFIC_IPS.includes(lowerHostname)) {
    return {
      isValid: false,
      error: `Access to cloud metadata service IP '${hostname}' is prohibited.`
    };
  }

  // 5. Check if hostname is an IPv4 or IPv6 address literal
  const ipType = net.isIP(hostname);

  if (ipType === 4) {
    const octets = hostname.split('.').map(Number);
    const ipCheck = isPrivateOrReservedIPv4(octets);
    if (ipCheck.isPrivate) {
      return {
        isValid: false,
        error: `Target IP '${hostname}' is restricted: ${ipCheck.reason}.`
      };
    }
  } else if (ipType === 6) {
    const words = expandIPv6(hostname);
    if (words) {
      const ipCheck = isPrivateOrReservedIPv6(words);
      if (ipCheck.isPrivate) {
        return {
          isValid: false,
          error: `Target IPv6 '${hostname}' is restricted: ${ipCheck.reason}.`
        };
      }
    }
  }

  return { isValid: true, parsedUrl: parsed };
}

/**
 * Sanitizes headers by stripping or masking sensitive authorization values
 * @param {Record<string, string>} headers - Input headers dictionary
 * @returns {Record<string, string>} Sanitized headers dictionary
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string') continue;
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = typeof value === 'string' ? value : String(value);
    }
  }
  return sanitized;
}

module.exports = {
  EXECUTION_LIMITS,
  ALLOWED_HTTP_METHODS,
  ALLOWED_PROTOCOLS,
  SENSITIVE_HEADERS,
  PROHIBITED_HOSTNAMES,
  PROHIBITED_DOMAIN_SUFFIXES,
  PROHIBITED_SPECIFIC_IPS,
  isPrivateOrReservedIPv4,
  expandIPv6,
  isPrivateOrReservedIPv6,
  validateTargetUrl,
  sanitizeHeaders
};
