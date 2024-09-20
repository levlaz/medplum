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
  buildMatrix(): Directory {
    // build matrix of node versions to test
    const nodeVersions = ["18", "20"]
    let output = dag.directory()

    for (const nodeVersion of nodeVersions) {
      let build = this.build(nodeVersion).directory("/tmp")
      output = output.withDirectory(`${nodeVersion}`, build.directory("/tmp"))
    }

    return output
  }

  /**
   * Build job modeled from .github/workflows/build.yml
   */
  @func()
  build(nodeVersion: string): Container {
    const outputPath = `/tmp/node-${nodeVersion}-stdout`

    return this.base(nodeVersion).
      withMountedCache("/root/.npm", dag.cacheVolume(`cache-node-${nodeVersion}-modules`)).
      withMountedCache("/src/node_modules", dag.cacheVolume(`cache-node-${nodeVersion}-app-modules`)).
      withEnvVariable("MEDPLUM_BASE_URL", "__MEDPLUM_BASE_URL__").
      withEnvVariable("MEDPLUM_CLIENT_ID", "__MEDPLUM_CLIENT_ID__").
      withEnvVariable("MEDPLUM_REGISTER_ENABLED", "__MEDPLUM_REGISTER_ENABLED__").
      withEnvVariable("GOOGLE_CLIENT_ID", "__GOOGLE_CLIENT_ID__").
      withEnvVariable("RECAPTCHA_SITE_KEY", "__RECAPTCHA_SITE_KEY__").
      withExec(["sh", "-c", "echo node version: $(node --version)"]).
      withExec(["sh", "-c", "echo npm version: $(npm --version)"]).
      withExec(["npm", "ci", "--maxsockets", "1"], {
        redirectStdout: "/tmp/stdout",
        redirectStderr: "/tmp/stderr"
      }).
      withExec(["npm", "run", "build"], {
        redirectStdout: "/tmp/stdout",
        redirectStderr: "/tmp/stderr"
      })
  }

  // /**
  //  * Test out custom span
  //  */
  // @func()
  // async test(): Promise<string> {
  //   return getTracer().startActiveSpan("custom-test", async () => {
  //     return this.base().withExec(["echo", "hello"]).stdout()
  //   })
  // }
}
