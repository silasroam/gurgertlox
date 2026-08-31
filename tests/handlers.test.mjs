// Smoke-тесты serverless-роутов на mock req/res (без БД):
// гарды методов, auth-401 до обращения к БД, HTTP-маппинг ошибок, in-flight lock.
import meHandler from '../api/user/me.js';
import openCaseHandler from '../api/open-case.js';
import { json, httpCodeFor, tryAcquire, release, readJson } from '../api/_lib/http.mjs';

let failed = 0;
function check(name, cond) {
    console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
    if (!cond) failed++;
}

function mockReq(method = 'GET', headers = {}, url = '/api/x', body = null) {
    const listeners = {};
    return {
        method,
        headers,
        url,
        on(ev, fn) { listeners[ev] = fn; if (ev === 'end') setImmediate(fn); return this; },
        destroy() {},
        __emit(ev, arg) { listeners[ev] && listeners[ev](arg); },
    };
}
function mockRes() {
    return {
        statusCode: 0,
        headers: {},
        body: '',
        setHeader(k, v) { this.headers[k] = v; },
        end(b) { this.body = b || ''; this.done = true; },
    };
}

// ── 1. Method guards ──
{
    const res = mockRes();
    await openCaseHandler(mockReq('GET'), res);
    check('open-case: GET -> 405', res.statusCode === 405);
}
{
    // Без валидного initData: 401 ДО любых обращений к БД.
    const res = mockRes();
    await meHandler(mockReq('GET', { 'x-init-data': 'garbage' }), res);
    check('user/me: плохой initData -> 401 (БД не тронута)', res.statusCode === 401 && res.done);
}

// ── 2. httpCodeFor: маппинг кодов ошибок ──
check('INSUFFICIENT -> 402', httpCodeFor({ code: 'INSUFFICIENT' }) === 402);
check('RACE -> 409', httpCodeFor({ code: 'RACE' }) === 409);
check('NOT_FOUND -> 404', httpCodeFor({ code: 'NOT_FOUND' }) === 404);
check('BAD_REQUEST -> 400', httpCodeFor({ code: 'BAD_REQUEST' }) === 400);
check('unknown -> 500', httpCodeFor(new Error('x')) === 500);

// ── 3. In-flight lock (анти double-click) ──
check('lock: первый захват ок', tryAcquire(42) === true);
check('lock: второй захват -> отказ (409-путь)', tryAcquire(42) === false);
release(42);
check('lock: после release снова ок', tryAcquire(42) === true);
release(42);

// ── 4. readJson: валидный JSON / битый JSON ──
{
    const req = mockReq('POST', {}, '/api/x', null);
    setImmediate(() => { req.__emit('data', '{"a":1}'); req.__emit('end'); });
    const out = await readJson(req);
    check('readJson: валидный JSON', out && out.a === 1);
}
{
    const req = mockReq('POST', {}, '/api/x', null);
    setImmediate(() => { req.__emit('data', '{broken'); req.__emit('end'); });
    const out = await readJson(req);
    check('readJson: битый JSON -> {} (без падения)', out && Object.keys(out).length === 0);
}

// ── 5. json(): корректный ответ ──
{
    const res = mockRes();
    json(res, 200, { ok: true });
    check('json(): статус + Content-Type + тело', res.statusCode === 200 && res.headers['Content-Type'].includes('application/json') && JSON.parse(res.body).ok === true);
}

console.log(failed ? ('FAILED: ' + failed) : 'ALL OK');
process.exit(failed ? 1 : 0);
