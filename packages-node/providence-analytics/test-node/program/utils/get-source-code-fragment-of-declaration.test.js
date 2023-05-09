import { expect } from 'chai';
import { it } from 'mocha';
import { mock } from '../../../test-helpers/mock-project-helpers.js';
import { getSourceCodeFragmentOfDeclaration } from '../../../src/program/utils/index.js';
import { memoizeConfig } from '../../../src/program/utils/memoize.js';

describe('getSourceCodeFragmentOfDeclaration', () => {
  const initialMemoizeSsCacheDisabled = memoizeConfig.isCacheDisabled;
  before(() => {
    memoizeConfig.isCacheDisabled = true;
  });
  after(() => {
    memoizeConfig.isCacheDisabled = initialMemoizeSsCacheDisabled;
  });

  describe('Named specifiers', () => {
    it('finds source code for directly declared specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': 'export const x = 0;',
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: 'x',
      });

      expect(sourceFragment).to.equal('0');
    });

    it('finds source code for referenced specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': `
            const y = 0;
            export const x = y;
          `,
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: 'x',
      });

      expect(sourceFragment).to.equal('0');
    });

    it('finds source code for rereferenced specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': `
            const x = 88;
            const y = x;
            export const myIdentifier = y;
          `,
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: 'myIdentifier',
      });

      expect(sourceFragment).to.equal('88');
    });

    it('finds source code for imported referenced specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file-1.js': `
        export const black59 = '#aaa';
        `,
        '/my/proj/exports/file-2.js': `
        import { black59 } from './file-1.js';
        export const black67 = black59;
        `,
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file-2.js',
        exportedIdentifier: 'black67',
        projectRootPath: '/my/proj',
      });

      expect(sourceFragment).to.equal("'#aaa'");
    });

    describe('Different types of declarations', () => {
      it('handles class declarations', async () => {
        const fakeFs = {
          '/my/proj/exports/ajax.js': `
        import { AjaxClass as LionAjaxClass } from 'some-external-package';
        export class AjaxClass extends LionAjaxClass {}
        `,
        };
        mock(fakeFs);

        const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
          filePath: '/my/proj/exports/ajax.js',
          exportedIdentifier: 'AjaxClass',
        });

        expect(sourceFragment).to.equal('class AjaxClass extends LionAjaxClass {}');
      });

      it('handles function declarations', async () => {
        const fakeFs = {
          '/my/proj/exports/myFn.js': `
        export function myFn() {}
        `,
        };
        mock(fakeFs);

        const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
          filePath: '/my/proj/exports/myFn.js',
          exportedIdentifier: 'myFn',
        });

        expect(sourceFragment).to.equal('function myFn() {}');
      });
    });
  });

  describe('[default] specifiers', () => {
    it('finds source code for directly declared specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': 'export default class {};',
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: '[default]',
      });

      expect(sourceFragment).to.equal('class {}');
    });

    it('finds source code for referenced specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': `
              const myIdentifier = 0;
              export default myIdentifier;
            `,
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: '[default]',
      });

      expect(sourceFragment).to.equal('0');
    });

    it('finds source code for rereferenced specifiers', async () => {
      const fakeFs = {
        '/my/proj/exports/file.js': `
              const x = 88;
              const myIdentifier = x;
              export default myIdentifier;
            `,
      };
      mock(fakeFs);

      const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
        filePath: '/my/proj/exports/file.js',
        exportedIdentifier: '[default]',
      });

      expect(sourceFragment).to.equal('88');
    });

    describe('Different types of declarations', () => {
      it('handles class declarations', async () => {
        const fakeFs = {
          '/my/proj/exports/ajax.js': `
        import { AjaxClass as LionAjaxClass } from '../_legacy/ajax/index.js';

        export default class AjaxClass extends LionAjaxClass {}
        `,
        };
        mock(fakeFs);

        const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
          filePath: '/my/proj/exports/ajax.js',
          exportedIdentifier: '[default]',
        });

        expect(sourceFragment).to.equal('class AjaxClass extends LionAjaxClass {}');
      });

      it('handles function declarations', async () => {
        const fakeFs = {
          '/my/proj/exports/myFn.js': `
        export default function myFn() {}
        `,
        };
        mock(fakeFs);

        const { sourceFragment } = await getSourceCodeFragmentOfDeclaration({
          filePath: '/my/proj/exports/myFn.js',
          exportedIdentifier: '[default]',
        });

        expect(sourceFragment).to.equal('function myFn() {}');
      });
    });
  });
});
