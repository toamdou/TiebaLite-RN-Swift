// Generate protobuf JSON descriptor from Kotlin proto files
// Run: node scripts/generate-protos.mjs
import { writeFileSync, renameSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createRequire } from 'module';
import protobuf from 'protobufjs';

const PROTO_DIR = 'src/services/api/protos_src';
const OUTPUT = 'src/services/api/protos.json';
const require = createRequire(import.meta.url);
const { applyProtosPatches } = require('./add-protos.js');

// Recursively find all .proto files
function findProtos(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findProtos(fullPath));
    } else if (entry.endsWith('.proto')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Load all proto files into a root
const root = new protobuf.Root();
root.resolvePath = (origin, target) => {
  // Proto files use flat imports like import "CommonRequest.proto"
  // Search in all directories under PROTO_DIR
  const searchDirs = (dir) => {
    const results = [];
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        results.push(...searchDirs(fullPath));
      } else if (entry === target || entry === basename(target)) {
        results.push(fullPath);
      }
    }
    return results;
  };
  const found = searchDirs(PROTO_DIR);
  if (found.length > 0) {
    return found[0];
  }
  return null;
};

const protoFiles = findProtos(PROTO_DIR);
console.log(`Found ${protoFiles.length} proto files`);

// Load main entry points (ALL API responses must be included)
const mainFiles = [
  join(PROTO_DIR, 'HotThreadList', 'HotThreadList.proto'),
  join(PROTO_DIR, 'TopicList', 'TopicList.proto'),
  join(PROTO_DIR, 'PbPage', 'PbPageResponse.proto'),
  join(PROTO_DIR, 'PbPage', 'PbPageRequest.proto'),
  join(PROTO_DIR, 'PbFloor', 'PbFloorResponse.proto'),
  join(PROTO_DIR, 'PbFloor', 'PbFloorRequest.proto'),
  join(PROTO_DIR, 'FrsPage', 'FrsPage.proto'),
  join(PROTO_DIR, 'Profile', 'ProfileResponse.proto'),
  join(PROTO_DIR, 'Profile', 'ProfileRequest.proto'),
  join(PROTO_DIR, 'BawuTeam.proto'),
  join(PROTO_DIR, 'BawuRoleDes.proto'),
  join(PROTO_DIR, 'BawuRoleInfoPub.proto'),
];
for (const file of mainFiles) {
  console.log(`Loading ${file}...`);
  protobuf.loadSync(file, root);
}

// Resolve all types
root.resolveAll();

// Generate JSON descriptor, then apply the hand-maintained API namespaces
const json = root.toJSON();
const patched = applyProtosPatches(json);
const tmpOutput = `${OUTPUT}.tmp`;
writeFileSync(tmpOutput, JSON.stringify(patched));
renameSync(tmpOutput, OUTPUT);
console.log(`Written ${OUTPUT} (${JSON.stringify(json).length} bytes)`);
