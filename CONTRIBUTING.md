# Contributing to ESE

Contributions, bug reports and practical electrical-document test cases are welcome.

Before opening a pull request:

1. create a focused branch;
2. keep the `.ese` format platform-independent and inspectable;
3. do not add copyrighted manuals, private projects, signing keys or credentials;
4. run `npm test`, `npm run build` and `npm run check:rust`;
5. explain the user-visible behaviour and platforms tested.

Real-world schematics are especially useful for OCR and interaction testing, but only redistribute material whose licence explicitly permits it. Local private fixtures belong in `tests/fixtures/ocr/local-private/`, which is ignored by Git.

By contributing, you agree that your contribution is distributed under the repository licence, GNU GPL v3 or later.
