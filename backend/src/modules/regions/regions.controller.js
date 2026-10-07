const regionsService = require('./regions.service');

async function createRegion(req, res, next) {
  try {
    const region = await regionsService.createRegion({
      userId: req.auth.userId,
      companyId: req.auth.companyId,
      payload: req.body,
    });

    return res.status(201).json({
      success: true,
      message: 'Region created successfully',
      data: {
        region,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listRegions(req, res, next) {
  try {
    const regions = await regionsService.listRegions({
      companyId: req.auth.companyId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      data: {
        regions,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getRegion(req, res, next) {
  try {
    const region = await regionsService.getRegion({
      companyId: req.auth.companyId,
      regionId: req.params.regionId,
    });

    return res.status(200).json({
      success: true,
      data: {
        region,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateRegion(req, res, next) {
  try {
    const region = await regionsService.updateRegion({
      userId: req.auth.userId,
      companyId: req.auth.companyId,
      regionId: req.params.regionId,
      payload: req.body,
    });

    return res.status(200).json({
      success: true,
      message: 'Region updated successfully',
      data: {
        region,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRegion,
  listRegions,
  getRegion,
  updateRegion,
};
