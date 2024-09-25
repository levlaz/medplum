/**
 * A Dagger Module for Medplum CI Pipeline
 */
import { dag, Container, Directory, object, func, argument } from "@dagger.io/dagger"
import { getTracer } from "@dagger.io/dagger/telemetry"

@object()
class Medplum {
  source: Directory 

  /**
   * Module level arguments using constructor
   * @param source location of source code, defaults to current working dir
   * 
   * more info on defaultPath: https://docs.dagger.io/manuals/developer/functions/#directories-and-files 
   * more info on constructor: https://docs.dagger.io/manuals/developer/entrypoint-function/
   */
  constructor(@argument({ defaultPath: "." }) source: Directory) {
    this.source = source
  }

  /**
   * Return base container image
   * 
   * @param nodeVersion version of NodeJS for base image
   *
   */
  @func()
  base(
    nodeVersion = "latest",
  ): Container {
    return dag.
      container().
      from(`node:${nodeVersion}`).
      withDirectory("/src", this.source).
      withWorkdir("/src")
  }
  
  /**
   * Run matrix build of node versions
   */
  @func()
  async buildMatrix(): Promise<string> {
    // build matrix of node versions to test
    const nodeVersions = ["18", "20"]
    let output = ""

    for (const nodeVersion of nodeVersions) {
      output += (await this.build(nodeVersion)).stdout()
    }

    return output
  }

  /**
   * Build job modeled from .github/workflows/build.yml
   */
  @func()
  build(nodeVersion: string): Promise<Container> {
    return getTracer().startActiveSpan(`build ${nodeVersion}`, async () => {
      return this.base(nodeVersion).
        withMountedCache("/root/.npm", dag.cacheVolume(`cache-${nodeVersion}-npm`)).
        withMountedCache("/src/node_modules", dag.cacheVolume(`cache-${nodeVersion}-node-modules`)).
        withMountedCache("/src/.turbo/cache", dag.cacheVolume(`cache-${nodeVersion}-turbo`)).
        withEnvVariable("MEDPLUM_BASE_URL", "__MEDPLUM_BASE_URL__").
        withEnvVariable("MEDPLUM_CLIENT_ID", "__MEDPLUM_CLIENT_ID__").
        withEnvVariable("MEDPLUM_REGISTER_ENABLED", "__MEDPLUM_REGISTER_ENABLED__").
        withEnvVariable("GOOGLE_CLIENT_ID", "__GOOGLE_CLIENT_ID__").
        withEnvVariable("RECAPTCHA_SITE_KEY", "__RECAPTCHA_SITE_KEY__").
        withExec(["sh", "-c", "echo node version: $(node --version)"]).
        withExec(["sh", "-c", "echo npm version: $(npm --version)"]).
        withExec(["npm", "ci", "--maxsockets", "1"]).
        withExec(["npm", "run", "build"]).
        withExec(["npm", "run", "lint"])
    })
}
}
