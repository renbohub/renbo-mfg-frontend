const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const ejs = require("ejs");

async function main() {
  for (const demoDate of [null, "2028-02-29"]) {
    const locals = { title: "Demo", demoDate, requiresAuth: false };
    const render = (name) => ejs.renderFile(path.join(__dirname, "../views/partials", name + ".ejs"), locals);
    const head = await render("head");
    const script = head.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context = vm.createContext({ window: {}, Date });
    vm.runInContext(script, context);
    const now = context.window.erpBusinessNow();
    if (demoDate) assert.equal(now.toISOString().slice(0, 10), demoDate);
    else assert.ok(Math.abs(now.getTime() - Date.now()) < 1000);
    const toolbar = await render("context-navbar-actions");
    const account = await render("navbar-account");
    assert.ok(account.includes('Tanggal Demo'));
    assert.ok(account.includes(demoDate || 'Mengikuti tanggal aktual'));
    if (demoDate) assert.ok(toolbar.includes('Tanggal Demo ' + demoDate));
    else assert.ok(!toolbar.includes('class="navbar-demo-badge"'));
    const modal = await render("demo-date");
    assert.ok(modal.includes('value="' + (demoDate || "") + '"'));
    assert.ok(modal.includes('id="demo-date-reset"'));
  }
  console.log("Demo date: rendered toolbar, modal, leap date and browser clock/reset passed.");
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
