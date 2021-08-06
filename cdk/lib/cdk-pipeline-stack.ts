import { CfnOutput, Construct, Stage, StageProps, Stack, StackProps, Aws, } from "@aws-cdk/core";
import { CodePipeline, CodePipelineSource, ShellStep } from "@aws-cdk/pipelines";
import { GraphqlApiStack } from "./api-stack";
import { VpcStack } from "./vpc-stack";
import { RDSStack } from "./rds-stack";

// Define deployable unit of our app in a stage; consider putting this in seperate file
interface AppStageProps extends StageProps {
  rdsPasswordSecretArnSsmParamName: string;
}

class AppStage extends Stage {
  public readonly apiPath: CfnOutput;
  public readonly rdsEndpoint: CfnOutput;
  public readonly rdsUsername: CfnOutput;
  public readonly rdsDatabase: CfnOutput;

  constructor(scope: Construct, id: string, props?: AppStageProps) {
    super(scope, id, props);

    const vpcStack = new VpcStack(this, "VPCStack");

    const rdsStack = new RDSStack(this, "RDSStack", {
      vpc: vpcStack.vpc,
      securityGroup: vpcStack.ingressSecurityGroup,
      rdsPwdSecretArnSsmParameterName: props?.rdsPasswordSecretArnSsmParamName || ""
    });

    const api = new GraphqlApiStack(this, "APIStack", {
      vpc: vpcStack.vpc,
      inboundDbAccessSecurityGroup:
        rdsStack.postgresRDSInstance.connections.securityGroups[0].securityGroupId,
      rdsEndpoint: rdsStack.postgresRDSInstance.dbInstanceEndpointAddress,
      rdsDbUser: rdsStack.rdsDbUser,
      rdsDbName: rdsStack.rdsDbName,
      rdsPort: rdsStack.rdsPort,
      rdsPassword: rdsStack.rdsPassword
    });

    this.apiPath = api.apiPathOutput;
    this.rdsEndpoint = rdsStack.rdsEndpointOutput;
    this.rdsUsername = rdsStack.rdsUsernameOutput;
    this.rdsDatabase = rdsStack.rdsDatabaseOutput;
  }
}

export class CdkPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const githubOrg = process.env.GITHUB_ORG || "kevasync";
    const githubRepo = process.env.GITHUB_REPO || "awsmug-serverless-graphql-api";
    const githubBranch = process.env.GITHUB_REPO || "master";

    const pipeline = new CodePipeline(this, "Pipeline", {
      pipelineName: "AWSMugPipeline",
      synth: new ShellStep("deploy", {
        input: CodePipelineSource.gitHub(`${githubOrg}/${githubRepo}`, githubBranch),
        commands: [
          "npm ci",
          "npm run build",
          "npx cdk synth"
        ]
      }),
    });

    pipeline.addStage(new AppStage(this, "demo", {
      env: { account: Aws.ACCOUNT_ID, region: Aws.REGION },
      rdsPasswordSecretArnSsmParamName: "rds-password-secret-arn"
    }));
  }
}