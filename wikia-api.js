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

// Designed to work with the API endpoint of MediaWiki 1.19.24

const https = require('https');
const url = require('url');

const {buildQS, buildCookieHeader, toPrimitive} = require('./utils');

const API_ENDPOINT = 'api.php';

const WikiaCookies = [
	'wikia_session_id', 
	'wikicities_session', // .login.sessionid @ https://www.mediawiki.org/w/index.php?title=API:Login&oldid=768007#Confirm_token

	'wikicitiesUserID',
	'wikicitiesUserName',
	'wikicitiesToken', // .login.lgtoken @ https://www.mediawiki.org/w/index.php?title=API:Login&oldid=768007#Confirm_token
	'access_token',
];

async function reqJSON(reqOptions, cookies = new Map(), ...rest) {
	return new Promise((resolve, reject) => {
		const req = https.request(reqOptions, function onResponse(res) {
			readCookieHeader(res.headers['set-cookie'], cookies, WikiaCookies);
			const buffer = [];
			res.on('data', chunk => buffer.push(chunk));
			res.on('end', () => {
				resolve({
					cookies: cookies,
					body: Buffer.concat(buffer).toString('utf8'),
				});
			});
		}).on('error', reject).setTimeout(1000).end(...rest);
	}).then(({cookies, body}) => {
		return {
			cookies: cookies,
			content: JSON.parse(body),
		};
	});
}

async function postLoginConfirmToken(host, credentials, authEnv) {
	const qs = buildQS({
		action: 'login',
		lgname: credentials.username,
		lgpassword: credentials.password,
		lgtoken: authEnv.token,
		format: 'json',
	});
	const reqOptions = url.parse(`https://${host}/${API_ENDPOINT}?${qs}`);
	reqOptions.method = 'POST';
	reqOptions.headers = {
		'Accept': 'application/json',
		'Cookie': buildCookieHeader(authEnv.cookies),
		'User-Agent': 'Latest Chapter Bot',
	};

	return reqJSON(reqOptions, authEnv.cookies).then(({cookies, content}) => {
		// {result, lguserid, lgusername, lgtoken, cookieprefix, sessionid}
		if (!content || !content.login  || !content.login.lgtoken) return Promise.reject(new Error(`Invalid API response.`));
		for (const envOpt of ['lgtoken', 'sessionid']) {
			authEnv[envOpt] = toPrimitive(content.login[envOpt]);
		}
		return Promise.resolve(authEnv);
	});
}

async function postLogin(host, credentials) {
	const qs = buildQS({
		action: 'login',
		lgname: credentials.username,
		lgpassword: credentials.password,
		format: 'json',
	});
	const reqOptions = url.parse(`https://${host}/${API_ENDPOINT}?${qs}`);
	reqOptions.method = 'POST';
	reqOptions.headers = {
		'Accept': 'application/json',
		'User-Agent': 'Latest Chapter Bot',
	};

	return reqJSON(reqOptions).then(({cookies, content}) => {
		if (!content || !content.login  || !content.login.token) return Promise.reject(new Error(`Invalid API response.`));
		// {result, token, cookieprefix}
		if (!['Success', 'NeedToken'].includes(content.login.result)) return Promise.reject(new Error(`Login failed.`));

		const authEnv = {cookies};
		for (const envOpt of ['token']) {
			authEnv[envOpt] = toPrimitive(content.login[envOpt]);
		}

		if (content.login.result === 'Success') {
			return Promise.resolve(authEnv);
		} else { // needToken
			// https://www.mediawiki.org/w/index.php?title=API:Login&oldid=768007#Confirm_token
			return postLoginConfirmToken(host, credentials, authEnv);
		}
	});
}

async function getEditInfo(host, updateArticles, authEnv) {
	// https://www.mediawiki.org/w/index.php?title=Manual:Edit_token&oldid=453409
	const qs = buildQS({
		action: 'query',
		prop: 'info',
		intoken: 'edit',
		titles: Array.from(updateArticles.keys()).join('|'),
		indexpageids: '',
		format: 'json',
	});
	const reqOptions = url.parse(`https://${host}/${API_ENDPOINT}?${qs}`);
	reqOptions.method = 'GET';
	reqOptions.headers = {
		'Accept': 'application/json',
		'Cookie': buildCookieHeader(authEnv.cookies),
		'User-Agent': 'Latest Chapter Bot',
	};

	return reqJSON(reqOptions).then(({content}) => {
		if (!content || !content.query || !content.query.pages || typeof content.query.pages !== 'object') return Promise.reject(new Error(`Invalid API response.`));
		return Promise.resolve(Object.values(content.query.pages));
	});
}

async function updatePage(host, updateArticles, pageInfo, authEnv, registeredBot = false) {
	if (!updateArticles.has(pageInfo.title)) return;

	const chapterTitle = updateArticles.get(pageInfo.title);
	if (!chapterTitle) return;

	const body = buildQS({
		action: 'edit',
		title: pageInfo.title,
		text: chapterTitle,
		summary: 'Update latest chapter',
		token: pageInfo.edittoken,
		assert: registeredBot ? 'bot' : 'user',
		format: 'json',
	});
	const reqOptions = url.parse(`https://${host}/${API_ENDPOINT}`);
	reqOptions.method = 'POST';
	reqOptions.headers = {
		'Accept': 'application/json',
		'Content-Length': Buffer.byteLength(body),
		'Content-Type': 'application/x-www-form-urlencoded',
		'Cookie': buildCookieHeader(authEnv.cookies),
		'User-Agent': 'Latest Chapter Bot',
	};

	return reqJSON(reqOptions, authEnv.cookies, body).then(content => {
		if (content.error) return Promise.reject(new Error(toPrimitive(content.error && content.error.info) || 'Edit failed'));
		return Promise.resolve();
	});
}

async function execUpdate(host, updateArticles, credentials) {
	const authEnv = await postLogin(host, credentials); // {cookies, token, lgtoken, sessionid}
	const pages = await getEditInfo(host, updateArticles, authEnv);
	for (const pageInfo of pages) {
		await updatePage(host, updateArticles, pageInfo, authEnv, credentials.registeredBot);
	}
}


module.exports = {
	update: execUpdate,
};
