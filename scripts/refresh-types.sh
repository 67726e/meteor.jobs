#!/usr/bin/env bash

set -e

JOB_SOURCE="./src/index.ts"
JOB_DEFINITION_SOURCE="jobs.d.ts"
MODULE_NAME="meteor/simplesigner:jobs"
MODULE_SOURCE="simplesigner-jobs.d.ts"

# Build w/
#   `jobs.ts`
#       `package.js` Irrelevant to Types...
#   `--skipLibCheck`
#   `--declaration`
#       We want the `jobs.d.ts` output...
#   `--emitDeclarationOnly`
#       We do not want the `jobs.js` output...
npx tsc \
    ${JOB_SOURCE} \
    --skipLibCheck \
    --declaration \
    --emitDeclarationOnly

# Surprisingly no good way to `cat` N files...
# 1. Create Temporary Combined Type Definition File...
# See: https://stackoverflow.com/a/12037693
TYPE_TEMPORARY_FILE="/tmp/meteor.jobs.ts.tmp"

rm -f ${TYPE_TEMPORARY_FILE}

for TYPE_SOURCE_FILE in $(ls ./src/*.d.ts);
do
    cat ${TYPE_SOURCE_FILE} >> ${TYPE_TEMPORARY_FILE}
done

# Remove Source Type Definition Files
rm -f ./src/*.d.ts

# 1. Catenate Type Definition File
# 2. Prepend Tab per Line
    # See: https://unix.stackexchange.com/a/552704
TYPES=$(cat ${TYPE_TEMPORARY_FILE} | ( TAB=$'\t' ; sed "s/^/$TAB/" ))

# Create Type Definition for Meteor Package Convention
echo "
declare module '${MODULE_NAME}' {
${TYPES}
}
" > ${MODULE_SOURCE}
