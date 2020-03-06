/*!
 * Copyright 2019 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as fs from 'fs';
import {OutgoingHttpHeaders} from 'http';
import * as path from 'path';
import * as sinon from 'sinon';
import * as querystring from 'querystring';

import {Storage, GetSignedUrlConfig} from '../src/';
import * as url from 'url';

export enum UrlStyle {
  PATH_STYLE = 'PATH_STYLE',
  VIRTUAL_HOSTED_STYLE = 'VIRTUAL_HOSTED_STYLE',
  BUCKET_BOUND_HOSTNAME = 'BUCKET_BOUND_HOSTNAME',
}

interface V4SignedURLTestCase {
  description: string;
  bucket: string;
  object?: string;
  urlStyle?: UrlStyle;
  bucketBoundHostname?: string;
  scheme: 'https' | 'http';
  headers?: OutgoingHttpHeaders;
  queryParameters?: {[key: string]: string};
  method: string;
  expiration: number;
  timestamp: string;
  expectedUrl: string;
}

interface V4SignedPolicyTestCase {
  description: string;
  policyInput: PolicyInput;
  policyOutput: PolicyOutput;
}

interface PolicyInput {
  scheme: 'https' | 'http';
  bucket: string;
  object: string;
  expiration: number;
  timestamp: string;
  conditions?: Conditions;
  fields?: {[key: string]: string};
}

interface Conditions {
  contentLengthRange: [number, number];
  startsWith: [string, string];
  acl: string;
}

interface PolicyOutput {
  url: string;
  fields: {[key: string]: string};
}

interface FileAction {
  [key: string]: 'read' | 'resumable' | 'write' | 'delete';
}

interface BucketAction {
  [key: string]: 'list';
}

const testFile = fs.readFileSync(
  path.join(__dirname, '../../conformance-test/test-data/v4SignedUrl.json'),
  'utf-8'
);

// tslint:disable-next-line no-any
const testCases: any[] = JSON.parse(testFile).signingV4Tests;
const v4SignedUrlCases = new Array<V4SignedURLTestCase>();
const v4SignedPolicyCases = new Array<V4SignedPolicyTestCase>();

for (const testCase of testCases) {
  if (testCase.expectedUrl) {
    v4SignedUrlCases.push(testCase);
  } else if (testCase.policyInput) {
    v4SignedPolicyCases.push(testCase);
  }
}


const SERVICE_ACCOUNT = path.join(
  __dirname,
  '../../conformance-test/fixtures/signing-service-account.json'
);

const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

describe('v4 signed url', () => {
  v4SignedUrlCases.forEach(testCase => {
    it(testCase.description, async () => {
      const NOW = new Date(testCase.timestamp);

      const fakeTimer = sinon.useFakeTimers(NOW);
      const bucket = storage.bucket(testCase.bucket);
      const expires = NOW.valueOf() + testCase.expiration * 1000;
      const version = 'v4' as 'v4';
      const domain = testCase.bucketBoundHostname
        ? `${testCase.scheme}://${testCase.bucketBoundHostname}`
        : undefined;
      const {cname, virtualHostedStyle} = parseUrlStyle(
        testCase.urlStyle,
        domain
      );
      const extensionHeaders = testCase.headers;
      const queryParams = testCase.queryParameters;
      const baseConfig = {
        extensionHeaders,
        version,
        expires,
        cname,
        virtualHostedStyle,
        queryParams,
      };
      let signedUrl: string;

      if (testCase.object) {
        const file = bucket.file(testCase.object);

        const action = ({
          GET: 'read',
          POST: 'resumable',
          PUT: 'write',
          DELETE: 'delete',
        } as FileAction)[testCase.method];

        [signedUrl] = await file.getSignedUrl({
          action,
          ...baseConfig,
        } as GetSignedUrlConfig);
      } else {
        // bucket operation
        const action = ({
          GET: 'list',
        } as BucketAction)[testCase.method];

        [signedUrl] = await bucket.getSignedUrl({
          action,
          ...baseConfig,
        });
      }

      const expected = new url.URL(testCase.expectedUrl);
      const actual = new url.URL(signedUrl);

      assert.strictEqual(actual.origin, expected.origin);
      assert.strictEqual(actual.pathname, expected.pathname);
      // Order-insensitive comparison of query params
      assert.deepStrictEqual(
        querystring.parse(actual.search),
        querystring.parse(expected.search)
      );

      fakeTimer.restore();
    });
  });
});

// tslint:disable-next-line ban
describe.skip('v4 signed policy', () => {
  v4SignedPolicyCases.forEach(testCase => {
    // TODO: implement parsing v4 signed policy tests
    it(testCase.description, async () => {
      // const input = testCase.policyInput;
      // const NOW = new Date(input.timestamp);

      // const fakeTimer = sinon.useFakeTimers(NOW);
      // const bucket = storage.bucket(input.bucket);
      // const expires = NOW.valueOf() + input.expiration * 1000;

      // const options = {};
      // const fields = input.fields || {};
      // // fields that Node.js supports as argument to method.
      // const acl = fields.acl;
      // delete fields.acl;
      // const successActionStatus = fields.success_action_status;
      // delete fields.successActionStatus;
      // const successActionRedirect = fields.success_action_redirect;
      // delete fields.successActionRedirect;

      // const conditions = input.conditions || {} as Conditions;
      // // conditions that Node.js support as argument to method.
      // const startsWith = conditions.startsWith;
      // let contentLengthMin
      // if (conditions.contentLengthRange) {

      // }

      // fakeTimer.restore();
    });
  })
});

function parseUrlStyle(
  style?: UrlStyle,
  domain?: string
): {cname?: string; virtualHostedStyle?: boolean} {
  if (style === UrlStyle.BUCKET_BOUND_HOSTNAME) {
    return {cname: domain};
  } else if (style === UrlStyle.VIRTUAL_HOSTED_STYLE) {
    return {virtualHostedStyle: true};
  } else {
    return {virtualHostedStyle: false};
  }
}
