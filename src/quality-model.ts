/**
 * Coefficients of the day-quality probabilities (step 6, METODIKA §4.5), copied from
 * data/quality/quality-model.json as written by `npm run quality` on 2026-10-04; a test checks that
 * the two agree. Every curve is a logistic P = 1 / (1 + exp(-(a + b·g))) on the model value named in
 * the comment, fitted on the Historical Forecast (lead 0, winters 2022/23-2025/26, six GeoSphere
 * stations); the lead time is not modelled (the curves move little to ~3 days, §5.3).
 *
 * What is deliberately absent, because the archive showed no skill (§5.4): a wind tag for powder
 * days, a "sunny top above a grey valley" flag, and the inversion from IFS.
 */

export interface Curve { a: number; b: number }
export interface CurveMulti { a: number; b: number[] }

export interface QualityCurves {
  /** g = sqrt(rain mm at the base during lift hours); event rain >= rulesBadMm / rainFairMm. */
  rainBad: Curve;
  rainFair: Curve;
  /** g = max gust km/h at the top during lift hours / 10; event gust > 60 / > 40 km/h. */
  gustBad: Curve;
  gustFair: Curve;
  /** g = 7 - sunshine hours at the top during lift hours; event sunshine < 1 h. */
  sunLow: Curve;
  /** g = [7 - sunshine hours, mean low cloud cover / 100, mean relative humidity / 100]; used when the response carries the two extra columns. */
  sunLowCloud: CurveMulti;
}

export const QUALITY_MODEL = {
  version: 1,
  fittedOn: "2026-10-04",
  curves: {
    "ecmwf_ifs": {
      "rainBad": {
        "a": -5.2693,
        "b": 2.6588
      },
      "rainFair": {
        "a": -4.2151,
        "b": 2.8113
      },
      "gustBad": {
        "a": -4.1678,
        "b": 0.5605
      },
      "gustFair": {
        "a": -3.1865,
        "b": 0.7619
      },
      "sunLow": {
        "a": -2.797,
        "b": 0.7461
      },
      "sunLowCloud": {
        "a": -4.9219,
        "b": [
          0.5469,
          1.2266,
          2.9922
        ]
      }
    },
    "icon_d2": {
      "rainBad": {
        "a": -5.2014,
        "b": 3.9907
      },
      "rainFair": {
        "a": -3.8392,
        "b": 4.2338
      },
      "gustBad": {
        "a": -6.1414,
        "b": 0.7833
      },
      "gustFair": {
        "a": -4.7098,
        "b": 0.9506
      },
      "sunLow": {
        "a": -2.4989,
        "b": 0.9215
      },
      "sunLowCloud": {
        "a": -6.1719,
        "b": [
          0.6328,
          2.8828,
          4.0078
        ]
      }
    }
  } as Record<string, QualityCurves>,
  /** Inversion at 13:00 local: P(top warmer than the base) from the model's own difference T(top) - T(base) in °C; ICON-D2 only, IFS has no skill. */
  inversion: {
    "icon_d2": {
      "a": 0.4677,
      "b": 0.9213
    }
  } as Record<string, Curve>,
  /**
   * Temperature during snowfall in the POWDER_SNEH window, weighted by the hour's snow: bands from the
   * literature (not fitted), the bias of each model measured against stations (IFS 1.0 °C too cold on
   * three leads) and added back; only on days with at least minSnowCm of forecast snow.
   */
  snowTemp: { dryC: -4, wetC: -1, minSnowCm: 4.8999999999999995, biasC: {"ecmwf_ifs":1,"icon_d2":0.1} as Record<string, number> },
};

export type QualityModel = typeof QUALITY_MODEL;
