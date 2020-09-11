var axios = require('axios');
const fs = require('fs');

function getRequestConfig(page = 1) {
  var data = JSON.stringify({
    'operationName': 'JobSearchResultsX',
    'variables': {
      'filterConfigurationInput': {
        'page': page,
        'locationTagIds': ['1904'],  // Hardcoded to Bangalore
        'remoteCompanyLocationTagIds': ['153509'],
        'roleTagIds': ['14726'],  // Hardcoded for software engineer
        'companySizes': [
          'SIZE_11_50', 'SIZE_51_200', 'SIZE_201_500', 'SIZE_501_1000',
          'SIZE_1001_5000', 'SIZE_5000_PLUS'
        ],
        'equity': {'min': null, 'max': null},  // No constraint on equity
        'includeJobsWithoutExperience': true,
        'remotePreference': 'REMOTE_OPEN',
        'salary': {'min': 100, 'max': null},  // Hardcoded for minimum 1,00,000
        'currencyCode': 'INR',
        'yearsExperience':
            {'min': null, 'max': 3}  // Hardcoded years of experience 0-3
      }
    },
    'query':
        'query JobSearchResultsX($filterConfigurationInput: FilterConfigurationInput!) {\n  talent {\n    jobSearchResults(filterConfigurationInput: $filterConfigurationInput) {\n      rawQuery\n      totalStartupCount\n      startups {\n        edges {\n          node {\n            ... on StartupSearchResult {\n              ...StartupResultSearchResultFragment\n              __typename\n            }\n            ... on PromotedResult {\n              promotionId\n              promotedStartup {\n                ...StartupResultFragment\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment StartupResultSearchResultFragment on StartupSearchResult {\n  id\n  ...BadgeBarSearchResultFragment\n  ...StartupHeaderSearchResultFragment\n  ...StarStartupSearchResultButtonFragment\n  highlightedJobListings {\n    ...JobListingListSearchResultFragment\n    __typename\n  }\n  __typename\n}\n\nfragment BadgeBarSearchResultFragment on StartupSearchResult {\n  id\n  badges {\n    ...BadgeFragment\n    __typename\n  }\n  __typename\n}\n\nfragment BadgeFragment on Badge {\n  id\n  name\n  label\n  tooltip\n  avatarUrl\n  rating\n  __typename\n}\n\nfragment StartupHeaderSearchResultFragment on StartupSearchResult {\n  id\n  name\n  slug\n  logoUrl\n  highConcept\n  companySize\n  locationTaggings {\n    id\n    displayName\n    __typename\n  }\n  __typename\n}\n\nfragment StarStartupSearchResultButtonFragment on StartupSearchResult {\n  id\n  currentUserHasStarred\n  __typename\n}\n\nfragment JobListingListSearchResultFragment on JobListingSearchResult {\n  id\n  autoPosted\n  atsSource\n  description\n  jobType\n  liveStartAt\n  locationNames\n  primaryRoleTitle\n  remote\n  slug\n  title\n  reposted\n  ...JobListingCompensationSearchResultFragment\n  __typename\n}\n\nfragment JobListingCompensationSearchResultFragment on JobListingSearchResult {\n  id\n  compensation\n  estimatedSalary\n  equity\n  usesEstimatedSalary\n  __typename\n}\n\nfragment StartupResultFragment on Startup {\n  id\n  ...BadgeBarFragment\n  ...StartupHeaderFragment\n  ...StarStartupButtonFragment\n  highlightedJobListings {\n    ...JobListingListFragment\n    __typename\n  }\n  __typename\n}\n\nfragment BadgeBarFragment on Startup {\n  id\n  badges {\n    ...BadgeFragment\n    __typename\n  }\n  __typename\n}\n\nfragment StartupHeaderFragment on Startup {\n  id\n  name\n  slug\n  logoUrl\n  highConcept\n  companySize\n  __typename\n}\n\nfragment StarStartupButtonFragment on Startup {\n  id\n  currentUserHasStarred\n  __typename\n}\n\nfragment JobListingListFragment on JobListing {\n  id\n  autoPosted\n  atsSource\n  description\n  jobType\n  liveStartAt\n  locationNames\n  primaryRoleTitle\n  remote\n  slug\n  title\n  reposted\n  ...JobListingCompensationFragment\n  __typename\n}\n\nfragment JobListingCompensationFragment on JobListingBaseInterfaceType {\n  id\n  compensation\n  estimatedSalary\n  equity\n  usesEstimatedSalary\n  __typename\n}\n'
  });

  var config = {
    method: 'post',
    url: 'https://angel.co/graphql?fallbackAOR=talent ',
    headers: {
      'x-requested-with': 'XMLHttpRequest',
      'Content-Type': 'application/json'
    },
    data: data
  };
  return config
}

var aggregateData = [];

/**
 * Handles the different cases in which compensation is present
 * @param {string} comp Compensation
 * @return {number} Compensation in Lacs
 */
function getCompensationHelper(comp) {
  comp = comp.trim();
  if (comp[comp.length - 1] == 'L') {  // Compensation is in lacs (1.5L)
    return parseFloat(comp.substring(0, comp.length - 1));
  }
  if (comp[comp.length - 1] == 'r') {  // Compensation is in crores (1.2 Cr)
    return parseFloat(comp.substring(0, comp.length - 2)) * 100;
  }
  comp = comp.replace(',', '');  // Compensation is in Rs (50,000)
  return parseFloat(comp) / 100000;
}

/**
 * Extracts minimum and maximum compensation
 * @param {string} comp Compensation
 * @return {Array} Compensation in Lacs
 */
function getCompensation(text) {
  var re1 = /^₹(.*)\–.*₹(.*)•/
  var re2 = /^₹(.*)\–.*₹(.*)/
  var ret = [];
  if (re1.test(text)) {
    m = text.match(re1);
    ret = [m[1], m[2]];
  } else {
    m = text.match(re2);
    ret = [m[1], m[2]];
  }
  ret[0] = getCompensationHelper(ret[0])
  ret[1] = getCompensationHelper(ret[1])
  return ret;
}

/**
 * Helper function to extract data from startup data object
 */
function extractStartupData(data) {
  data = data.node;
  jobData = data.highlightedJobListings;
  var companyName = data.name;
  for (var i = 0; i < jobData.length; i++) {
    var job = jobData[i];
    var j = {};
    j.title = job.title;
    comp = getCompensation(job.compensation);
    j.compensation_low = comp[0];
    j.compensation_high = comp[1];
    j.company = companyName;
    j.concept = data.highConcept
    aggregateData.push(j);
  }
}

/**
 * Driver function to extract data one page after another
 */
function run(page = 1) {
  console.log('Running Page: ', page);
  axios(getRequestConfig(page))
      .then(function(response) {
        var data = response.data;
        var startups = data.data.talent.jobSearchResults.startups.edges;
        for (var i = 0; i < startups.length; i++)
          extractStartupData(startups[i]);

        if (startups.length == 0) {
          // No more data left, dump to file
          fs.writeFile(
              'output.json', JSON.stringify(aggregateData), 'utf8',
              function(err) {
                if (err) {
                  console.log(
                      'An error occured while writing JSON Object to File.');
                  return console.log(err);
                }
                console.log('JSON file has been saved.');
              });
          return;
        } else {
          // Extract next page
          run(page + 1);
        }
      })
      .catch(function(error) {
        console.log(error);
      });
}

run()
