// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as api from '@opentelemetry/api';
import {VERSION as CORE_VERSION} from '@opentelemetry/core';
import {Resource} from '@opentelemetry/resources';
import type {ReadableSpan} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import {getReadableSpanTransformer} from '../src/transform';
import {LinkType, Span, Code, Status, SpanKind} from '../src/types';
import {VERSION} from '../src/version';

describe('transform', () => {
  let readableSpan: ReadableSpan;
  let transformer: (readableSpan: ReadableSpan) => Span;
  let spanContext: api.SpanContext;

  beforeEach(() => {
    spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: api.TraceFlags.NONE,
      isRemote: true,
    };

    transformer = getReadableSpanTransformer('project-id');

    readableSpan = {
      attributes: {},
      duration: [32, 800000000],
      startTime: [1566156729, 709],
      endTime: [1566156731, 709],
      ended: true,
      events: [],
      kind: api.SpanKind.CLIENT,
      links: [],
      name: 'my-span',
      spanContext: () => spanContext,
      status: {code: api.SpanStatusCode.OK},
      resource: new Resource({
        service: 'ui',
        version: 1,
        cost: 112.12,
      }),
      instrumentationLibrary: {name: 'default', version: '0.0.1'},
    };
  });

  it('should transform spans', () => {
    const result = transformer(readableSpan);

    assert.deepStrictEqual(result, {
      attributes: {
        attributeMap: {
          'g.co/agent': {
            stringValue: {
              value: `opentelemetry-js ${CORE_VERSION}; google-cloud-trace-exporter ${VERSION}`,
            },
          },
        },
        droppedAttributesCount: 0,
      },
      displayName: {value: 'my-span'},
      links: {link: []},
      endTime: {seconds: 1566156731, nanos: 709},
      startTime: {seconds: 1566156729, nanos: 709},
      name: 'projects/project-id/traces/d4cda95b652f4a1592b449d5929fda1b/spans/6e0c63257de34c92',
      spanId: '6e0c63257de34c92',
      spanKind: SpanKind.CLIENT,
      status: {code: Code.OK},
      timeEvents: {timeEvent: []},
      sameProcessAsParentSpan: {value: false},
    } as Span);
  });
  it('should transform spans with parent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (readableSpan as any).parentSpanId = '3e0c63257de34c92';
    const result = transformer(readableSpan);
    assert.deepStrictEqual(result.parentSpanId, '3e0c63257de34c92');
  });

  it('should transform spans without parent', () => {
    const result = transformer(readableSpan);
    assert.deepStrictEqual(result.parentSpanId, undefined);
  });

  it('should transform remote spans', () => {
    const remote = transformer(readableSpan);
    assert.deepStrictEqual(remote.sameProcessAsParentSpan, {value: false});
  });

  it('should transform local spans', () => {
    readableSpan.spanContext().isRemote = false;
    const local = transformer(readableSpan);
    assert.deepStrictEqual(local.sameProcessAsParentSpan, {value: true});
  });

  it('should transform attributes', () => {
    readableSpan.attributes.testBool = true;
    readableSpan.attributes.testInt = 3;
    readableSpan.attributes.testString = 'str';

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.attributes!.attributeMap!.testBool, {
      boolValue: true,
    });
    assert.deepStrictEqual(result.attributes!.attributeMap!.testInt, {
      intValue: '3',
    });
    assert.deepStrictEqual(result.attributes!.attributeMap!.testString, {
      stringValue: {value: 'str'},
    });
    assert.deepStrictEqual(result.attributes!.droppedAttributesCount, 0);
  });

  it('should transform http attributes', () => {
    readableSpan.attributes['http.method'] = 'POST';
    readableSpan.attributes['http.scheme'] = 'https';
    readableSpan.attributes['http.host'] = 'example.com';

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.attributes!.attributeMap!['/http/method'], {
      stringValue: {value: 'POST'},
    });
    assert.deepStrictEqual(
      result.attributes!.attributeMap!['/http/client_protocol'],
      {
        stringValue: {value: 'https'},
      }
    );
    assert.deepStrictEqual(result.attributes!.attributeMap!['/http/host'], {
      stringValue: {value: 'example.com'},
    });
  });

  it('should drop unknown attribute types', () => {
    // @ts-expect-error testing behavior with unsupported type
    readableSpan.attributes.testUnknownType = {message: 'dropped'};
    const result = transformer(readableSpan);
    // count of 1 for just the g.co/agent attribute
    assert.deepStrictEqual(result.attributes!.droppedAttributesCount, 1);
    assert.strictEqual(Object.keys(result.attributes!.attributeMap!).length, 1);
  });

  it('should transform links', () => {
    readableSpan.links.push({
      context: {
        traceId: 'a4cda95b652f4a1592b449d5929fda1b',
        spanId: '3e0c63257de34c92',
        traceFlags: api.TraceFlags.SAMPLED,
      },
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.links, {
      link: [
        {
          attributes: {
            attributeMap: {},
            droppedAttributesCount: 0,
          },
          traceId: 'a4cda95b652f4a1592b449d5929fda1b',
          spanId: '3e0c63257de34c92',
          type: LinkType.UNSPECIFIED,
        },
      ],
    });
  });

  it('should transform links with attributes', () => {
    readableSpan.links.push({
      context: {
        traceId: 'a4cda95b652f4a1592b449d5929fda1b',
        spanId: '3e0c63257de34c92',
        traceFlags: api.TraceFlags.SAMPLED,
      },
      attributes: {
        testAttr: 'value',
        // @ts-expect-error testing behavior with unsupported type
        droppedAttr: {},
      },
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.links, {
      link: [
        {
          attributes: {
            attributeMap: {
              testAttr: {
                stringValue: {
                  value: 'value',
                },
              },
            },
            droppedAttributesCount: 1,
          },
          traceId: 'a4cda95b652f4a1592b449d5929fda1b',
          spanId: '3e0c63257de34c92',
          type: LinkType.UNSPECIFIED,
        },
      ],
    });
  });

  it('should transform events', () => {
    readableSpan.events.push({
      name: 'something happened',
      time: [1566156729, 809],
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.timeEvents, {
      timeEvent: [
        {
          annotation: {
            attributes: {
              attributeMap: {},
              droppedAttributesCount: 0,
            },
            description: {
              value: 'something happened',
            },
          },
          time: {seconds: 1566156729, nanos: 809},
        },
      ],
    });
  });

  it('should transform events with attributes', () => {
    readableSpan.events.push({
      name: 'something happened',
      attributes: {
        error: true,
        // @ts-expect-error testing behavior with unsupported type
        dropped: {},
      },
      time: [1566156729, 809],
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.timeEvents, {
      timeEvent: [
        {
          annotation: {
            attributes: {
              attributeMap: {
                error: {
                  boolValue: true,
                },
              },
              droppedAttributesCount: 1,
            },
            description: {
              value: 'something happened',
            },
          },
          time: {seconds: 1566156729, nanos: 809},
        },
      ],
    });
  });

  it('should transform statuses', () => {
    const unsetResult = transformer({
      ...readableSpan,
      status: {code: api.SpanStatusCode.UNSET},
    });
    assert.strictEqual(unsetResult.status, undefined);

    const okResult = transformer({
      ...readableSpan,
      status: {code: api.SpanStatusCode.OK},
    });
    assert.deepStrictEqual<Status>(okResult.status, {
      code: Code.OK,
    });

    const errorMesssage = 'error occurred';
    const errorResult = transformer({
      ...readableSpan,
      status: {code: api.SpanStatusCode.ERROR, message: errorMesssage},
    });
    assert.deepStrictEqual<Status>(errorResult.status, {
      code: Code.UNKNOWN,
      message: errorMesssage,
    });

    // some unexpected status code is converted to error
    const futureAddedCodeResult = transformer({
      ...readableSpan,
      status: {code: -10},
    });
    assert.deepStrictEqual<Status>(futureAddedCodeResult.status, {
      code: Code.UNKNOWN,
      message: undefined,
    });
  });

  it('should transform gce_instance resource to g.co/r/gce_instance/* labels', () => {
    const result = transformer({
      ...readableSpan,
      resource: new Resource({
        'cloud.provider': 'gcp',
        'host.id': 'foobar.com',
        'cloud.availability_zone': 'us-west1-a',
      }),
    });
    assert.deepStrictEqual(result.attributes, {
      attributeMap: {
        'g.co/agent': {
          stringValue: {
            value: `opentelemetry-js ${CORE_VERSION}; google-cloud-trace-exporter ${VERSION}`,
          },
        },
        'g.co/r/gce_instance/instance_id': {
          stringValue: {
            value: 'foobar.com',
          },
        },
        'g.co/r/gce_instance/project_id': {
          stringValue: {
            value: 'project-id',
          },
        },
        'g.co/r/gce_instance/zone': {
          stringValue: {
            value: 'us-west1-a',
          },
        },
      },
      droppedAttributesCount: 0,
    });
  });

  it('should transform resource attributes matching resourceFilter', () => {
    const transformer = getReadableSpanTransformer('project-id', /^custom\./);

    const result = transformer({
      ...readableSpan,
      resource: new Resource({
        'custom.foo': 'bar',
        'custom.bool': true,
        'custom.number': 5,
        'not.custom.thing': 'not-custom',
        'custom-without-a-dot': 'ignored',
      }),
    });
    assert.deepStrictEqual(result.attributes, {
      attributeMap: {
        'custom.foo': {
          stringValue: {
            value: 'bar',
          },
        },
        'custom.bool': {
          boolValue: true,
        },
        'custom.number': {
          intValue: '5',
        },
        'g.co/agent': {
          stringValue: {
            value: `opentelemetry-js ${CORE_VERSION}; google-cloud-trace-exporter ${VERSION}`,
          },
        },
      },
      droppedAttributesCount: 0,
    });
  });

  it('should transform span kinds', () => {
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: api.SpanKind.INTERNAL,
      }).spanKind,
      SpanKind.INTERNAL
    );
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: api.SpanKind.SERVER,
      }).spanKind,
      SpanKind.SERVER
    );
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: api.SpanKind.CLIENT,
      }).spanKind,
      SpanKind.CLIENT
    );
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: api.SpanKind.PRODUCER,
      }).spanKind,
      SpanKind.PRODUCER
    );
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: api.SpanKind.CONSUMER,
      }).spanKind,
      SpanKind.CONSUMER
    );
  });

  it('should transform span kind of unknown future value', () => {
    assert.strictEqual(
      transformer({
        ...readableSpan,
        kind: 16,
      }).spanKind,
      SpanKind.SPAN_KIND_UNSPECIFIED
    );
  });
});
