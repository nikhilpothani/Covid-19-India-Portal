const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//authorization of a user
const authenticateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  console.log(authHeader);
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secret_Token", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_Secret_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get All Status Details API
app.get("/states/", authenticateUser, async (request, response) => {
  const getStatusQuery = `SELECT * FROM state;`;
  const states = await db.all(getStatusQuery);
  response.send(
    states.map((eachState) => convertStateDbToResponseObject(eachState))
  );
});

//Get State by StateID API
app.get("/states/:stateId/", async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  response.send(convertStateDbToResponseObject(state));
});

//Post District API
app.post("/districts/", authenticateUser, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
    INSERT INTO
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES
      ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`;
  const postDistrict = await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

//Get District API
app.get(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDistrictDbToResponseObject(district));
  }
);

//Delete District API
app.delete(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update District API
app.put(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const updateDistrictQuery = `
    UPDATE
      district
    SET
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE
      district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get Total Cases Details API
app.get(
  "/states/:stateId/stats/",
  authenticateUser,
  async (request, response) => {
    const { stateId } = request.params;
    const getTotalCasesQuery = `
    SELECT
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM
      district
    WHERE 
      state_id = ${stateId}`;
    const stats = await db.get(getTotalCasesQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
