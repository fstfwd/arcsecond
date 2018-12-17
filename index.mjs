import {Left, Right} from 'data.either';

const id = x => x;

export const pipeParsers = fns => () => state => {
  return fns.slice(1).reduce((nextState, fn) => fn()(nextState), fns[0]()(state))
};

export const composeParsers = fns => () => x => {
  return pipeParsers ([...fns].reverse()) (x);
};

export const parse = parser => targetString => {
  const parserState = Right([0, targetString, null]);
  return parser()(parserState).map(([_, __, result]) => result);
};

export const char = c => () => state => {
  if (!c || c.length !== 1) {
    throw new TypeError (`char must be called with a single character, but got ${c}`);
  }

  return state.chain(([index, targetString, res]) => {
    const rest = targetString.slice(index);
    if (rest.length >= 1) {
      if (rest[0] === c) {
        return Right ([index + 1, targetString, c]);
      } else {
        return Left (`ParseError (position ${index}): Expecting character '${c}', got '${rest[0]}'`);
      }
    }
    return Left (`ParseError (position ${index}): Expecting character '${c}', but got end of input.`);
  });
};

export const str = s => () => state => {
  if (!s || s.length < 1) {
    throw new TypeError (`str must be called with a string with length > 1, but got ${s}`);
  }

  return state.chain(([index, targetString, res]) => {
    const rest = targetString.slice(index);
    if (rest.length >= 1) {
      if (rest.startsWith(s)) {
        return Right ([index + s.length, targetString, s]);
      } else {
        return Left (`ParseError (position ${index}): Expecting string '${s}', got '${rest.slice(0, s.length)}...'`);
      }
    }
    return Left (`ParseError (position ${index}): Expecting string '${s}', but got end of input.`);
  });
};

export const digit = () => state => {
  return state.chain(([index, targetString, res]) => {
    const rest = targetString.slice(index);

    if (rest.length >= 1) {
      if (/[0-9]/.test(rest[0])) {
        return Right ([index + 1, targetString, rest[0]]);
      } else {
        return Left (`ParseError (position ${index}): Expecting digit, got '${rest[0]}'`);
      }
    }
    return Left (`ParseError (position ${index}): Expecting digit, but got end of input.`);
  });
}

export const letter = () => state => {
  return state.chain(([index, targetString, res]) => {
    const rest = targetString.slice(index);

    if (rest.length >= 1) {
      if (/[a-zA-Z]/.test(rest[0])) {
        return Right ([index + 1, targetString, rest[0]]);
      } else {
        return Left (`ParseError (position ${index}): Expecting letter, got ${rest[0]}`);
      }
    }
    return Left (`ParseError (position ${index}): Expecting letter, but got end of input.`);
  });
}

export const many = parser => () => state => {
  return state.chain(innerState => {
    const results = [];
    let nextState = innerState;

    while (true) {
      let exit = false;

      const out = parser () (Right(nextState));
      out.cata({
        Right: x => {
          nextState = x;
          results.push(nextState[2]);
        },
        Left: () => {
          exit = true;
        }
      });

      if (exit) {
        break;
      }
    }

    const [index, targetString] = nextState;
    return Right ([index, targetString, results]);
  });
}

export const many1 = parser => () => state => {
  const res = many (parser) () (state);
  return res.chain(([index, targetString, value]) => {
    if (value.length === 0) {
      return Left (`ParseError 'many1' (position ${index}): Expecting to match at least one value`);
    }
    return Right ([index, targetString, value]);
  });
}

export const namedSequenceOf = pairedParsers => () => state => {
  return state.chain(innerState => {
    const results = {};
    let left = null;
    let nextState = innerState;

    for (const [key, parser] of pairedParsers) {
      const out = parser () (Right(nextState));

      out.cata ({
        Right: x => {
          nextState = x;
          results[key] = x[2];
        },
        Left: x => {
          left = x;
        }
      });

      if (left) {
        break;
      }
    }

    if (left) return Left (left);

    const [i, s] = nextState;
    return Right ([i, s, results]);
  });
}

export const sequenceOf = parsers => () => state => {
  return state.chain(innerState => {
    const results = [];
    let left = null;
    let nextState = innerState;

    for (const parser of parsers) {
      const out = parser () (Right(nextState));
      out.cata ({
        Right: x => {
          nextState = x;
          results.push(x[2]);
        },
        Left: x => {
          left = x;
        }
      });

      if (left) {
        break;
      }
    }

    if (left) return Left (left);

    const [i, s] = nextState;
    return Right ([i, s, results]);
  });
}

export const mapTo = fn => () => state => {
  return state.map(([index, targetString, res]) => {
    return [index, targetString, fn(res)];
  });
}

export const sepBy = valParser => sepParser => () => state => {
  return state.chain(innerState => {
    let nextState = innerState;
    let left = null;
    const results = [];

    while (true) {
      let exit = false;

      const valState = valParser () (Right (nextState));
      const sepState = sepParser () (valState);

      const unwrappedValState = valState.cata ({
        Right: x => {
          results.push(x[2]);
          return x;
        },
        Left: x => {
          left = x;
          exit = true;
        }
      });

      const unwrappedSepState = sepState.cata ({
        Right: id,
        Left: () => {
          nextState = unwrappedValState;
          exit = true;
        }
      });

      if (exit) break;

      nextState = unwrappedSepState;
    }

    if (left) {
      if (results.length === 0) {
        const [i, s] = innerState;
        return Right ([i, s, []]);
      }
      return Left (left);
    }

    const [i, s] = nextState;
    return Right ([i, s, results]);
  });
}

export const sepBy1 = valParser => sepParser => () => state => {
  const res = sepBy (valParser) (sepParser) () (state);
  return res.chain(([index, targetString, value]) => {
    if (value.length === 0) {
      return Left (`ParseError 'sepBy1' (position ${i}): Expecting to match at least one separated value`);
    }
    return Right ([index, targetString, value]);
  });
}

export const toPromise = result => {
  return result.cata({
    Left: x => Promise.reject(x),
    Right: x => Promise.resolve(x)
  });
}

export const choice = parsers => () => state => {
  return state.chain(([index]) => {
    let match = null;
    for (const parser of parsers) {
      let exit = false;
      const out = parser () (state);
      out.cata({
        Left: id,
        Right: x => {
          exit = true;
          match = Right (x);
        }
      });

      if (exit) break;
    }

    if (!match) {
      return Left (`ParseError 'choice' (position ${index}): Expecting to match at least parser`);
    }

    return match;
  });
}

export const between = leftParser => rightParser => parser => () => pipeParsers ([
  sequenceOf ([
    leftParser,
    parser,
    rightParser
  ]),
  mapTo (([_, x]) => x)
]);

export const everythingUntil = parser => () => state => {
  return state.chain (innerState => {
    const results = [];
    let nextState = innerState;
    let eof = false;

    while (true) {
      let exit = false;
      const out = parser () (Right (nextState));

      out.cata ({
        Left: () => {
          const [index, targetString] = nextState;
          const val = targetString[index];

          if (val) {
            results.push(val);
            nextState = [index + 1, targetString, val]
          } else {
            eof = true;
            exit = true;
          }
        },
        Right: x => {
          exit = true;
          nextState = x;
        }
      });

      if (exit) break;
    }

    if (eof) {
      return Left (`ParseError 'everythingUntil' (position ${nextState[0]}): Unexpected end of input.`);
    }

    const [i, s] = nextState;
    return Right ([i, s, results.join('')]);
  });
}

export const possibly = parser => () => state => {
  return state.chain(([i, s]) => {
    const nextState = parser () (state);
    return nextState.cata({
      Left: () => Right ([i, s, null]),
      Right: x => Right (x)
    });
  });
}

export const skip = parser => () => state => {
  return state.chain(([_, __, value]) => {
    const nextState = parser () (state);
    return nextState.cata ({
      Left: id,
      Right: ([i, s]) => {
        return Right ([i, s, value])
      }
    });
  })
}

export const takeRight = lParser => rParser => pipeParsers ([
  sequenceOf([lParser, rParser]),
  mapTo (x => x[1])
]);

export const takeLeft = lParser => rParser => pipeParsers ([
  sequenceOf([lParser, rParser]),
  mapTo (x => x[0])
]);
