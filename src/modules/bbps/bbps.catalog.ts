export const MOCK_BILLERS = [
  {
    id: 'biller_torrent_power',
    name: 'Torrent Power - Electricity',
    category: 'ELECTRICITY',
    paramName: 'consumerNumber',
  },
  {
    id: 'biller_maharashtra_state_electricity',
    name: 'MSEDCL - Electricity',
    category: 'ELECTRICITY',
    paramName: 'consumerNumber',
  },
  {
    id: 'biller_airtel_broadband',
    name: 'Airtel Broadband & Landline',
    category: 'BROADBAND',
    paramName: 'consumerNumber',
  },
  {
    id: 'biller_jio_postpaid',
    name: 'Jio Mobile Postpaid',
    category: 'MOBILE_POSTPAID',
    paramName: 'consumerNumber',
  },
  {
    id: 'biller_lic_premium',
    name: 'LIC Premium',
    category: 'LIC_INSURANCE',
    paramName: 'policyNumber',
  },
  {
    id: 'biller_hdfc_loan',
    name: 'HDFC Loan EMI',
    category: 'LOAN_EMI',
    paramName: 'loanAccount',
  },
] as const;
