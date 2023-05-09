import { expect } from 'chai';
import { it } from 'mocha';
import {
  mockProject,
  restoreMockedProjects,
  mockTargetAndReferenceProject,
} from '../../../test-helpers/mock-project-helpers.js';
import { resolveImportPath } from '../../../src/program/utils/resolve-import-path.js';
import { memoizeConfig } from '../../../src/program/utils/memoize.js';

describe('resolveImportPath', () => {
  beforeEach(() => {
    memoizeConfig.isCacheDisabled = true;
  });
  afterEach(() => {
    memoizeConfig.isCacheDisabled = false;
    restoreMockedProjects();
  });

  it(`resolves file in same project`, async () => {
    mockProject(
      {
        './src/declarationOfMyClass.js': `
        export class MyClass extends HTMLElement {}
      `,
        './currentFile.js': `
        import { MyClass } from './src/declarationOfMyClass';
      `,
      },
      {
        projectName: 'my-project',
        projectPath: '/my/project',
      },
    );

    const foundPath = await resolveImportPath(
      './src/declarationOfMyClass',
      '/my/project/currentFile.js',
    );
    expect(foundPath).to.equal('/my/project/src/declarationOfMyClass.js');
  });

  it(`resolves file in different projects`, async () => {
    const targetProject = {
      path: '/target/node_modules/ref',
      name: 'ref',
      files: [
        {
          file: './index.js',
          code: `
          export const x = 10;
          `,
        },
      ],
    };
    const referenceProject = {
      path: '/target',
      name: 'target',
      files: [
        // This file contains all 'original' exported definitions
        {
          file: './a.js',
          code: `
            import { x } from 'ref';
          `,
        },
      ],
    };

    mockTargetAndReferenceProject(targetProject, referenceProject);

    const foundPath = await resolveImportPath('ref', '/target/a.js');
    expect(foundPath).to.equal('/target/node_modules/ref/index.js');
  });

  it(`resolves export maps`, async () => {
    const targetProject = {
      path: '/target/node_modules/ref',
      name: 'ref',
      files: [
        {
          file: './packages/x/index.js',
          code: `
          export const x = 10;
          `,
        },
        {
          file: './package.json',
          code: JSON.stringify({
            name: 'ref',
            exports: {
              './x': './packages/x/index.js',
            },
          }),
        },
      ],
    };
    const referenceProject = {
      path: '/target',
      name: 'target',
      files: [
        // This file contains all 'original' exported definitions
        {
          file: './a.js',
          code: `
            import { x } from 'ref/x';
          `,
        },
      ],
    };

    mockTargetAndReferenceProject(targetProject, referenceProject);

    const foundPath = await resolveImportPath('ref/x', '/target/a.js');
    expect(foundPath).to.equal('/target/node_modules/ref/packages/x/index.js');
  });

  it(`resolves native node modules`, async () => {
    mockProject(
      {
        './src/someFile.js': `
       import { readFile } from 'fs';

       export const x = readFile('/path/to/someOtherFile.js');
      `,
      },
      {
        projectName: 'my-project',
        projectPath: '/my/project',
      },
    );

    const foundPath = await resolveImportPath('fs', '/my/project/someFile.js');
    expect(foundPath).to.equal('[node-builtin]');
  });

  /**
   * All edge cases are covered by https://github.com/rollup/plugins/tree/master/packages/node-resolve/test
   */
});
