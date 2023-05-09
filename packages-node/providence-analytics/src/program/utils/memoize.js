export const memoizeConfig = {
  isCacheDisabled: false,
};

/**
 * @param {object|any[]|string} arg
 */
function isObject(arg) {
  return !Array.isArray(arg) && typeof arg === 'object';
}

/**
 * @param {object|any[]|string} arg
 */
function createCachableArg(arg) {
  if (isObject(arg)) {
    try {
      return JSON.stringify(arg);
    } catch {
      return arg;
    }
  }
  return arg;
}

/**
 * @type {<T>(functionToMemoize:T, opts?:{ storage?:object; serializeObjects?: boolean }) => T}
 */
export function memoize(functionToMemoize, { storage = {}, serializeObjects = false } = {}) {
  // @ts-ignore
  // eslint-disable-next-line func-names
  return function () {
    // eslint-disable-next-line prefer-rest-params
    const args = [...arguments];
    const cachableArgs = !serializeObjects ? args : args.map(createCachableArg);
    // Allow disabling of cache for testing purposes
    // @ts-ignore
    if (!memoizeConfig.isCacheDisabled && cachableArgs in storage) {
      // @ts-ignore
      return storage[cachableArgs];
    }
    // @ts-ignore
    const outcome = functionToMemoize.apply(this, args);
    // @ts-ignore
    // eslint-disable-next-line no-param-reassign
    storage[cachableArgs] = outcome;
    return outcome;
  };
}
