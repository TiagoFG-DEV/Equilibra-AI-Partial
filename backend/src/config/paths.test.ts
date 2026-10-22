import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveSurveyRoot, projectRoot, backendRoot } from './paths';

test('resolve a arquitetura skills independente do diretório de execução', () => {
  assert.equal(resolveSurveyRoot(''), path.join(projectRoot, 'skills'));
  assert.equal(resolveSurveyRoot('../skills'), path.join(projectRoot, 'skills'));
  assert.equal(resolveSurveyRoot('..'), path.join(projectRoot, 'skills'));
  assert.equal(resolveSurveyRoot(projectRoot), path.join(projectRoot, 'skills'));
  assert.equal(resolveSurveyRoot(path.join(projectRoot, 'skills')), path.join(projectRoot, 'skills'));
  assert.equal(resolveSurveyRoot('custom'), path.join(backendRoot, 'custom'));
});
