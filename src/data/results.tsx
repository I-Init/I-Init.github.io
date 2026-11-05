import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

// Tables I-IV of the paper. A trailing * marks the values the paper sets in bold.

export type ResultColumn = { label: ReactNode; sub?: string[] };
export type ResultRow = { lead: ReactNode[]; cells: string[]; ours?: boolean };
export type ResultGroup = { title?: string; rows: ResultRow[] };
export type ResultTableData = {
  lead: ReactNode[];
  leadGroup?: string;
  columns: ResultColumn[];
  groups: ResultGroup[];
  cellClassName?: (value: string, column: number) => string | undefined;
};

const VEL_GDIR = ['Vel (m/s)', 'G.Dir (°)'];
const ATE_AVE = ['ATE', 'AVE'];
const DATASETS: ResultColumn[] = [
  { label: 'EuRoC', sub: ATE_AVE },
  { label: 'Blackbird', sub: ATE_AVE },
  { label: 'TLIO', sub: ATE_AVE },
];
const SUCCESS_RATE_COLUMN = 12;

const learned = <Check role='img' aria-label='Learned' className='mx-auto h-4 w-4 text-green-700' />;
const identity = <X role='img' aria-label='Identity' className='mx-auto h-4 w-4 text-red-700' />;

export const initializationTable: ResultTableData = {
  lead: ['Method'],
  columns: [
    { label: 'MH02', sub: VEL_GDIR },
    { label: 'MH04', sub: VEL_GDIR },
    { label: 'V101', sub: VEL_GDIR },
    { label: 'V103', sub: VEL_GDIR },
    { label: 'V202', sub: VEL_GDIR },
    { label: 'Avg.', sub: VEL_GDIR },
    { label: 'SR ↑' },
  ],
  groups: [
    {
      title: 'Visual-inertial initialization (camera + IMU)',
      rows: [
        { lead: ['VINS-Mono'], cells: ['0.085*', '1.093', '0.367', '1.447', '0.107*', '1.582', '0.187*', '2.748', '0.100*', '1.182*', '0.169*', '1.611', '0.51'] },
      ],
    },
    {
      title: 'IMU-only initialization, raw IMU',
      rows: [
        { lead: ['Network Init'], cells: ['0.212', '5.497', '0.259', '5.775', '0.218', '5.537', '0.372', '6.397', '0.365', '5.576', '0.285', '5.757', '0.25'] },
        { lead: ['I-Init: vel'], ours: true, cells: ['0.221', '5.930', '0.275', '6.062', '0.230', '6.140', '0.334', '6.430', '0.335', '5.677', '0.279', '6.048', '0.13'] },
        { lead: ['I-Init: +rp'], ours: true, cells: ['0.211', '2.170', '0.255', '2.259', '0.217', '2.109', '0.342', '4.922', '0.347', '3.751', '0.274', '3.042', '0.86'] },
      ],
    },
    {
      title: 'IMU-only initialization, +AirIMU',
      rows: [
        { lead: ['I-Init: vel'], ours: true, cells: ['0.207', '0.883', '0.254', '1.137', '0.213', '1.339', '0.330', '1.816', '0.335', '2.097', '0.268', '1.454', '0.95'] },
        { lead: ['I-Init: +rp'], ours: true, cells: ['0.207', '0.879*', '0.253*', '1.131*', '0.213', '1.329*', '0.330', '1.803*', '0.335', '2.084', '0.267', '1.445*', '0.95'] },
      ],
    },
  ],
  // The paper colors every success rate by value rather than bolding only the best.
  cellClassName: (value, column) => {
    if (column !== SUCCESS_RATE_COLUMN) return undefined;
    const rate = parseFloat(value);
    if (rate < 0.3) return 'font-semibold text-red-700';
    if (rate < 0.7) return 'font-semibold text-amber-700';
    return 'font-semibold text-green-700';
  },
};

export const odometryTable: ResultTableData = {
  lead: ['Method', 'Init'],
  columns: DATASETS,
  groups: [
    {
      title: 'Oracle-initialized EKF variants',
      rows: [
        { lead: ['TLIO EKF†', 'Oracle'], cells: ['4.279', '0.838', '8.294', '2.146', '1.702', '0.092'] },
        { lead: ['AirIO EKF†', 'Oracle'], cells: ['3.245', '0.264*', '2.331*', '0.219', '1.834', '0.089'] },
        { lead: ['I-Init EKF (oracle)†', 'Oracle'], ours: true, cells: ['2.970', '0.340', '2.759', '0.204', '1.353', '0.067*'] },
      ],
    },
    {
      title: 'EKF with IMU-only initialization (no ground-truth inputs)',
      rows: [
        { lead: ['Network Init', 'IMU-only'], cells: ['3.064', '0.342', '2.902', '0.200*', '1.359', '0.068'] },
        { lead: ['I-Init: vel', 'IMU-only'], ours: true, cells: ['3.002', '0.348', '2.777', '0.204', '1.348*', '0.067*'] },
        { lead: ['I-Init: +rp', 'IMU-only'], ours: true, cells: ['2.907*', '0.343', '2.791', '0.202', '1.349', '0.068'] },
      ],
    },
  ],
};

export const covarianceTable: ResultTableData = {
  lead: ['Network R', 'AirIMU Q'],
  leadGroup: 'Learned covariance',
  columns: DATASETS,
  groups: [
    {
      rows: [
        { lead: [identity, identity], cells: ['3.236', '0.374', '3.460', '0.309', '2.341', '0.104'] },
        { lead: [identity, learned], cells: ['16.768', '1.189', '59.640', '1.901', '3.518', '0.150'] },
        { lead: [learned, identity], cells: ['3.083', '0.439', '3.540', '1.184', '3.081', '0.142'] },
        { lead: [learned, learned], ours: true, cells: ['2.970*', '0.340*', '2.759*', '0.204*', '1.353*', '0.067*'] },
      ],
    },
  ],
};

export const networkOnlyTable: ResultTableData = {
  lead: ['Method', 'Init'],
  columns: DATASETS,
  groups: [
    {
      rows: [
        { lead: ['RoNIN', 'Oracle'], cells: ['7.604', '0.625', '8.830', '0.520', '2.193', '0.092'] },
        { lead: ['TLIO', 'Oracle'], cells: ['4.377', '0.560', '9.123', '0.618', '2.718', '0.119'] },
        { lead: ['AirIO', 'Oracle'], cells: ['3.831', '0.286*', '3.046', '0.185', '2.191', '0.102'] },
        { lead: ['I-Init (oracle)', 'Oracle'], ours: true, cells: ['3.255*', '0.360', '2.823*', '0.133*', '1.380*', '0.069*'] },
      ],
    },
  ],
};
