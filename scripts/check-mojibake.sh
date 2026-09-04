#!/bin/sh

set -eu

# Common mojibake markers are assembled from bytes so this scanner does not
# contain—and therefore cannot match—its own forbidden text. Mojibake is often
# valid UTF-8, so ordinary syntax and encoding checks do not catch it.
mojibake_pattern=$(printf '\303\242|\303\203|\303\202|\303\260\305\270|\357\277\275')

if git ls-files -z -co --exclude-standard | xargs -0 grep -nI -E "$mojibake_pattern"; then
  echo >&2 "Error: possible mojibake detected in tracked files."
  exit 1
fi

echo "No common mojibake sequences found."
