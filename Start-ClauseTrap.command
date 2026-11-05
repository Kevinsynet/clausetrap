#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
printf 'Keep this Terminal window open while using ClauseTrap.\n'
exec ./run.sh
