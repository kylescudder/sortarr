// The release workflow builds the commit SHA into the image as SORTARR_REVISION.
export const revision = () => process.env.SORTARR_REVISION || 'development'
