import child_process from 'child_process'; // eslint-disable-line camelcase
import path from 'path';
import fs from 'fs';
import commander from 'commander';
import { LogService } from '../program/core/LogService.js';
import { QueryService } from '../program/core/QueryService.js';
import { InputDataService } from '../program/core/InputDataService.js';
import { toPosixPath } from '../program/utils/to-posix-path.js';
import { getCurrentDir } from '../program/utils/get-current-dir.js';
import { dashboardServer } from '../dashboard/server.js';
import { _providenceModule } from '../program/providence.js';
import { _cliHelpersModule } from './cli-helpers.js';
import { _extendDocsModule } from './launch-providence-with-extend-docs.js';
import { _promptAnalyzerMenuModule } from './prompt-analyzer-menu.js';

/**
 * @typedef {import('../../types/index.js').AnalyzerName} AnalyzerName
 * @typedef {import('../../types/index.js').ProvidenceCliConf} ProvidenceCliConf
 */

const { version } = JSON.parse(
  fs.readFileSync(path.resolve(getCurrentDir(import.meta.url), '../../package.json'), 'utf8'),
);
const { extensionsFromCs, setQueryMethod, targetDefault, installDeps } = _cliHelpersModule;

/**
 * @param {{cwd?:string; argv?: string[]; providenceConf?: Partial<ProvidenceCliConf>}} cfg
 */
export async function cli({ cwd = process.cwd(), providenceConf, argv = process.argv }) {
  /** @type {(value: any) => void} */
  let resolveCli;
  /** @type {(reason?: any) => void} */
  let rejectCli;

  const cliPromise = new Promise((resolve, reject) => {
    resolveCli = resolve;
    rejectCli = reject;
  });

  /** @type {'analyzer'|'queryString'} */
  let searchMode;
  /** @type {object} */
  let analyzerOptions;
  /** @type {object} */
  let featureOptions;
  /** @type {object} */
  let regexSearchOptions;

  // TODO: change back to "InputDataService.getExternalConfig();" once full package ESM
  const externalConfig = providenceConf;

  /**
   * @param {'search-query'|'feature-query'|'analyzer-query'} searchMode
   * @param {{regexString: string}} regexSearchOptions
   * @param {{queryString: string}} featureOptions
   * @param {{name:AnalyzerName; config:object;promptOptionalConfig:object}} analyzerOptions
   * @returns
   */
  async function getQueryConfigAndMeta(
    /* eslint-disable no-shadow */
    searchMode,
    regexSearchOptions,
    featureOptions,
    analyzerOptions,
    /* eslint-enable no-shadow */
  ) {
    let queryConfig = null;
    let queryMethod = null;

    if (searchMode === 'search-query') {
      queryConfig = QueryService.getQueryConfigFromRegexSearchString(
        regexSearchOptions.regexString,
      );
      queryMethod = 'grep';
    } else if (searchMode === 'feature-query') {
      queryConfig = QueryService.getQueryConfigFromFeatureString(featureOptions.queryString);
      queryMethod = 'grep';
    } else if (searchMode === 'analyzer-query') {
      let { name, config } = analyzerOptions;
      if (!name) {
        const answers = await _promptAnalyzerMenuModule.promptAnalyzerMenu();

        name = answers.analyzerName;
      }
      if (!config) {
        const answers = await _promptAnalyzerMenuModule.promptAnalyzerConfigMenu(
          name,
          analyzerOptions.promptOptionalConfig,
        );
        config = answers.analyzerConfig;
      }
      // Will get metaConfig from ./providence.conf.js
      const metaConfig = externalConfig ? externalConfig.metaConfig : {};
      config = { ...config, metaConfig };
      queryConfig = await QueryService.getQueryConfigFromAnalyzer(name, config);
      queryMethod = 'ast';
    } else {
      LogService.error('Please define a feature, analyzer or search');
      process.exit(1);
    }
    return { queryConfig, queryMethod };
  }

  async function launchProvidence() {
    const { queryConfig, queryMethod } = await getQueryConfigAndMeta(
      searchMode,
      regexSearchOptions,
      featureOptions,
      analyzerOptions,
    );

    const searchTargetPaths = commander.searchTargetCollection || commander.searchTargetPaths;
    let referencePaths;
    if (queryConfig.analyzer.requiresReference) {
      referencePaths = commander.referenceCollection || commander.referencePaths;
    }

    /**
     * May or may not include dependencies of search target
     * @type {string[]}
     */
    let totalSearchTargets;
    if (commander.targetDependencies !== undefined) {
      totalSearchTargets = await _cliHelpersModule.appendProjectDependencyPaths(
        searchTargetPaths,
        commander.targetDependencies,
      );
    } else {
      totalSearchTargets = searchTargetPaths;
    }

    // TODO: filter out:
    // - dependencies listed in reference (?) Or at least, inside match-imports, make sure that
    //   we do not test against ourselves...
    // -

    _providenceModule.providence(queryConfig, {
      gatherFilesConfig: {
        extensions: commander.extensions,
        allowlistMode: commander.allowlistMode,
        allowlist: commander.allowlist,
      },
      gatherFilesConfigReference: {
        extensions: commander.extensions,
        allowlistMode: commander.allowlistModeReference,
        allowlist: commander.allowlistReference,
      },
      debugEnabled: commander.debug,
      queryMethod,
      targetProjectPaths: totalSearchTargets,
      referenceProjectPaths: referencePaths,
      targetProjectRootPaths: searchTargetPaths,
      writeLogFile: commander.writeLogFile,
      skipCheckMatchCompatibility: commander.skipCheckMatchCompatibility,
      measurePerformance: commander.measurePerf,
      addSystemPathsInResult: commander.addSystemPaths,
      fallbackToBabel: commander.fallbackToBabel,
    });
  }

  /**
   * @param {{update:boolean; deps:boolean;createVersionHistory:boolean}} options
   */
  async function manageSearchTargets(options) {
    const basePath = path.join(__dirname, '../..');
    if (options.update) {
      LogService.info('git submodule update --init --recursive');

      // eslint-disable-next-line camelcase
      const updateResult = child_process.execSync('git submodule update --init --recursive', {
        cwd: basePath,
      });

      LogService.info(String(updateResult));
    }
    if (options.deps) {
      await installDeps(commander.searchTargetPaths);
    }
    if (options.createVersionHistory) {
      await installDeps(commander.searchTargetPaths);
    }
  }

  commander
    .version(version, '-v, --version')
    .option('-e, --extensions [extensions]', 'extensions like "js,html"', extensionsFromCs, [
      '.js',
      '.html',
    ])
    .option('-D, --debug', 'shows extensive logging')
    .option(
      '-t, --search-target-paths [targets]',
      `path(s) to project(s) on which analysis/querying should take place. Requires
    a list of comma seperated values relative to project root`,
      v => _cliHelpersModule.pathsArrayFromCs(v, cwd),
      targetDefault(cwd),
    )
    .option(
      '-r, --reference-paths [references]',
      `path(s) to project(s) which serve as a reference (applicable for certain analyzers like
    'match-imports'). Requires a list of comma seperated values relative to
    project root (like 'node_modules/lion-based-ui, node_modules/lion-based-ui-labs').`,
      v => _cliHelpersModule.pathsArrayFromCs(v, cwd),
      InputDataService.referenceProjectPaths,
    )
    .option('-a, --allowlist [allowlist]', `allowlisted paths, like 'src/**/*, packages/**/*'`, v =>
      _cliHelpersModule.csToArray(v),
    )
    .option(
      '--allowlist-reference [allowlist-reference]',
      `allowed paths for reference, like 'src/**/*, packages/**/*'`,
      v => _cliHelpersModule.csToArray(v),
    )
    .option(
      '--search-target-collection [collection-name]',
      `path(s) to project(s) which serve as a reference (applicable for certain analyzers like
    'match-imports'). Should be a collection defined in providence.conf.js as paths relative to
    project root.`,
      v => _cliHelpersModule.pathsArrayFromCollectionName(v, 'search-target', externalConfig),
    )
    .option(
      '--reference-collection [collection-name]',
      `path(s) to project(s) on which analysis/querying should take place. Should be a collection
    defined in providence.conf.js as paths relative to project root.`,
      v => _cliHelpersModule.pathsArrayFromCollectionName(v, 'reference', externalConfig),
    )
    .option('--write-log-file', `Writes all logs to 'providence.log' file`)
    .option(
      '--target-dependencies [target-dependencies]',
      `For all search targets, will include all its dependencies
    (node_modules and bower_components). When --target-dependencies is applied
    without argument, it will act as boolean and include all dependencies.
    When a regex is supplied like --target-dependencies /^my-brand-/, it will filter
    all packages that comply with the regex`,
    )
    .option(
      '--allowlist-mode [allowlist-mode]',
      `Depending on whether we are dealing with a published artifact
      (a dependency installed via npm) or a git repository, different paths will be
      automatically put in the appropiate mode.
      A mode of 'npm' will look at the package.json "files" entry and a mode of
      'git' will look at '.gitignore' entry. A mode of 'export-map' will look for all paths
      exposed via an export map.
      The mode will be auto detected, but can be overridden
      via this option.`,
    )
    .option(
      '--allowlist-mode-reference [allowlist-mode-reference]',
      `allowlist mode applied to refernce project`,
    )
    .option(
      '--skip-check-match-compatibility',
      `skips semver checks, handy for forward compatible libs or libs below v1`,
    )
    .option('--measure-perf', 'Logs the completion time in seconds')
    .option('--add-system-paths', 'Adds system paths to results')
    .option(
      '--fallback-to-babel',
      'Uses babel instead of swc. This will be slower, but guaranteed to be 100% compatible with @babel/generate and @babel/traverse',
    );

  commander
    .command('search <regex>')
    .alias('s')
    .description('perfoms regex search string like "my-.*-comp"')
    .action((regexString, options) => {
      searchMode = 'search-query';
      regexSearchOptions = options;
      regexSearchOptions.regexString = regexString;
      launchProvidence().then(resolveCli).catch(rejectCli);
    });

  commander
    .command('feature <query-string>')
    .alias('f')
    .description('query like "tg-icon[size=xs]"')
    .option('-m, --method [method]', 'query method: "grep" or "ast"', setQueryMethod, 'grep')
    .action((queryString, options) => {
      searchMode = 'feature-query';
      featureOptions = options;
      featureOptions.queryString = queryString;
      launchProvidence().then(resolveCli).catch(rejectCli);
    });

  commander
    .command('analyze [analyzer-name]')
    .alias('a')
    .description(
      `predefined "query" for ast analysis. Can be a script found in program/analyzers,
    like "find-imports"`,
    )
    .option(
      '-o, --prompt-optional-config',
      `by default, only required configuration options are
    asked for. When this flag is provided, optional configuration options are shown as well`,
    )
    .option('-c, --config [config]', 'configuration object for analyzer', c => JSON.parse(c))
    .action((analyzerName, options) => {
      searchMode = 'analyzer-query';
      analyzerOptions = options;
      analyzerOptions.name = analyzerName;
      launchProvidence().then(resolveCli).catch(rejectCli);
    });

  commander
    .command('extend-docs')
    .alias('e')
    .description(
      `Generates data for "babel-extend-docs" plugin. These data are generated by the "match-paths"
    plugin, which automatically resolves import paths from reference projects
    (say [@lion/input, @lion/textarea, ...etc]) to a target project (say "wolf-ui").`,
    )
    .option(
      '--prefix-from [prefix-from]',
      `Prefix for components of reference layer. By default "lion"`,
      a => a,
      'lion',
    )
    .option(
      '--prefix-to [prefix-to]',
      `Prefix for components of reference layer. For instance "wolf"`,
    )
    .option(
      '--output-folder [output-folder]',
      `This is the file path where the result file "providence-extend-docs-data.json" will be written to`,
      p => toPosixPath(path.resolve(process.cwd(), p.trim())),
      process.cwd(),
    )
    .action(options => {
      if (!options.prefixTo) {
        LogService.error(`Please provide a "prefix to" like '--prefix-to "myprefix"'`);
        process.exit(1);
      }
      if (!commander.referencePaths) {
        LogService.error(`Please provide referencePaths path like '-r "node_modules/@lion/*"'`);
        process.exit(1);
      }
      const prefixCfg = { from: options.prefixFrom, to: options.prefixTo };
      _extendDocsModule
        .launchProvidenceWithExtendDocs({
          referenceProjectPaths: commander.referencePaths,
          prefixCfg,
          outputFolder: options.outputFolder,
          extensions: commander.extensions,
          allowlist: commander.allowlist,
          allowlistReference: commander.allowlistReference,
          skipCheckMatchCompatibility: commander.skipCheckMatchCompatibility,
          cwd,
        })
        .then(resolveCli)
        .catch(rejectCli);
    });

  commander
    .command('manage-projects')
    .description(
      `Before running a query, be sure to have search-targets up to date (think of
    npm/bower dependencies, latest version etc.)`,
    )
    .option('-u, --update', 'gets latest of all search-targets and references')
    .option('-d, --deps', 'installs npm/bower dependencies of search-targets')
    .option('-h, --create-version-history', 'gets latest of all search-targets and references')
    .action(options => {
      manageSearchTargets(options);
    });

  commander
    .command('dashboard')
    .description(
      `Runs an interactive dashboard that shows all aggregated data from proivdence-output, configured
      via providence.conf`,
    )
    .action(() => {
      dashboardServer.start();
    });

  commander.parse(argv);

  await cliPromise;
}
