// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// import {GCFBootstrapper} from 'gcf-utils';
// import appFn from './git-hangout';
//
// // eslint-disable-next-line @typescript-eslint/no-var-requires
// require('@google-cloud/debug-agent').start();
//
// const bootstrap = new GCFBootstrapper();
// module.exports['git_hangout'] = bootstrap.gcf(appFn, {
//   background: true,
//   logging: true
// });

import {createNodeMiddleware, createProbot} from 'probot';
import handler from './git-hangout';

module.exports.gitHangout = createNodeMiddleware(handler, {
  probot: createProbot(),
});

// import {GCFBootstrapper} from 'gcf-utils';
// import handler =  require('./git-hangout')
// import {ApplicationFunction} from 'probot';        // the handler that will be called for probot events, of type ApplicationFunction
//
// const bootstrap = new GCFBootstrapper();
//
// const wrapOptions =  {
//   background: true,     // enables the use of Cloud Tasks to execute in the background
//   logging: true,        // enables automatic logging of metrics
// }
//
// module.exports['gitHangout'] = bootstrap.gcf(handler as ApplicationFunction, wrapOptions);
