# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/itzalisha99/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/itzalisha99/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, built for the
[make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty "Read broken CSV files faster, 21 November 2026".
`run(input)` in `solve.js` returns exactly csv-reader's answer
`{columns, rows, errors}` for every `{text, header}` input, and
`main.ts` reads every case from `/input/cases.json` and writes the
answers to `/output/answers.json`.

## How it is fast

The reference reader walks the text one character at a time and
builds every field up a character at a time. This reader never does
that. At the start of each record it finds the record's first line
break once. Every field after that is cut with a comma or quote
search that stops inside the field, and one slice. Only the rare
broken shapes take a slower path: doubled quotes inside a quoted
field, a line break inside quotes, junk after a closing quote, a
stray CR, or a quote that never closes. All of those are still
driven by `indexOf`, segment by segment, never one character at a
time.

On the practice set (6 cases, about 10.2 MB of CSV) this reader
takes about 0.13 s where the reference takes about 0.5 s on the
same machine, roughly 3.5x faster, with all 6 cases identical to
the reference. The local grader confirms it: `passed 1`,
`cases_passed 6 / 6`.

## Run it

```sh
node main.ts
```

Node 22 or later, no dependencies, no network. Set
`MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` to run it outside
the harness container (they default to `/input` and `/output`).

## Broken rows, handled exactly like csv-reader

- A U+FEFF at the very start is dropped; a record ends at LF or
  CRLF, and an empty line is no record.
- Outside quotes a CR not followed by LF is dropped (`stray_cr`).
- A field opening with a quote runs to the next quote that is not
  doubled; `""` inside it is one quote, and each CRLF or lone CR
  inside it is read as LF. What follows the closing quote, up to
  the next comma or line break, is appended as it stands
  (`quote_junk`, when the field ends).
- A quote that never closes is a literal character, and the text
  after it is read again as unquoted (`unterminated_quote`).
- A quote inside an unquoted field is a literal character. Fields
  stay strings, never trimmed or converted.
- `columns` is the first record when `header` is true, else null;
  rows after it are padded with empty strings (`short_row`) or cut
  (`long_row`) to the first record's width.

## Referral

Made with make.fun — if you join a bounty there, use referral
code `y05d5qm6`.
