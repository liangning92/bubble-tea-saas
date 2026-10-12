// Route scanning discovers operations; it must not overwrite reviewed access policy.
function preserveReviewedPolicies(discovered, reviewed) {
 const merged={...discovered};
 for(const [key,policy] of Object.entries(reviewed))if(Object.hasOwn(merged,key))merged[key]=policy;
 return merged;
}
module.exports={preserveReviewedPolicies};
