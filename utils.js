"use strict";

/** Copyright (c) 2018 Leonardo Julca
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

function toPrimitive(value) {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	return '';
}

/**
 * @param {Object} options
 * @return {string}
 */
function buildQS(options) {
	const parts = [];
	for (const name in options) {
		parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(options[name])}`);
	}
	return parts.join('&');
}

/**
 * @param {Map} cookies
 * @return {string}
 */
function buildCookieHeader(cookies) {
	return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * @param {Array<string>} header - Cookie HTTP header, as a list
 * @param {Map?} cookies - Cookies stored by the client
 * @param {Array<string>?} whiteList - Optional white list for cookie names
 * @return {Map} - Mutated cookies
 */
function readCookieHeader(header, cookies = new Map(), whiteList) {
	if (!header) return '';

	for (const fullCookie of header) {
		if (!whiteList || whiteList.some(wlCookieName => fullCookie.startsWith(`${wlCookieName}=`))) {
			const cookie = fullCookie.split(';', 1)[0].trim();
			const eqIndex = cookie.indexOf('=');
			cookies.set(cookie.slice(0, eqIndex), cookie.slice(eqIndex + 1));
		}
	}

	return cookies;
}

module.exports = {
	toPrimitive,
	buildQS,
	buildCookieHeader,
	readCookieHeader,
};