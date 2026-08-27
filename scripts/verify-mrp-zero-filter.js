"use strict";

const assert = require("assert");
let zeroFilter = {};
try {
  zeroFilter = require("../public/js/ppic-mrp-zero-filter");
} catch (_error) {
  zeroFilter = {};
}
const { shouldHideZeroMatrixRow } = zeroFilter;

assert.strictEqual(
  typeof shouldHideZeroMatrixRow,
  "function",
  "UI MRP harus menyediakan filter qty nol yang dapat diuji",
);

assert.strictEqual(
  shouldHideZeroMatrixRow({ officialTotal: 0, lookaheadTotal: 0 }, false),
  false,
  "filter nonaktif harus tetap menampilkan baris qty nol",
);
assert.strictEqual(
  shouldHideZeroMatrixRow({ officialTotal: 1, lookaheadTotal: 0 }, true),
  false,
  "baris official positif tidak boleh disembunyikan",
);
assert.strictEqual(
  shouldHideZeroMatrixRow({ officialTotal: 0, lookaheadTotal: 1 }, true),
  false,
  "baris preview M+1 positif tidak boleh disembunyikan",
);
assert.strictEqual(
  shouldHideZeroMatrixRow({ officialTotal: 0, lookaheadTotal: 0 }, true),
  true,
  "baris dengan seluruh qty nol harus disembunyikan",
);
assert.strictEqual(
  shouldHideZeroMatrixRow({ officialTotal: 0.0000001, lookaheadTotal: 0 }, true),
  true,
  "noise pembulatan di bawah toleransi harus dianggap nol",
);

console.log("MRP zero-quantity filter contracts passed: 5/5 cases");
