import { log } from "architecture";
import { Literal } from "architecture/plugin";
import { TypeService } from "architecture/typing";

export class ContentDTO {
    private tags: string[] = [];
    private frontmatter: Record<string, Literal> = {};
    private content = "";

    public add(content: string): ContentDTO {
        this.content = this.content.concat(content);
        return this;
    }

    public get(): string {
        return this.content;
    }

    /**
   * Substitutes at the content the key for the result (all of them)
   * 
   * Expected format in the content: {{key}}
   * @param key 
   * @param result 
   */
    public modify(key: string, result: string) {
        // Regular expression to find all the matches of {{key}} in the content and replace them with the result
        this.content = this.content.replace(
            new RegExp(`{{${key}}}`, "g"),
            result
        );
        log.debug(`ContentDTO: modified content with key: {{${key}}} and result: ${result}`);
    }

    public hasTags(): boolean {
        return this.tags.length > 0;
    }
    public getTags(): string[] {
        return this.tags;
    }

    public addTags(potentialTags: Literal): ContentDTO {
        if (!potentialTags) return this;
        // Check if tag satisfies string
        if (TypeService.isString(potentialTags) && !this.tags.contains(potentialTags)) {
            this.addTag(potentialTags);
            return this;
        }

        if (TypeService.isArray<string>(potentialTags, "string")) {
            potentialTags.forEach((t) => {
                this.addTag(t);
            });
            return this;
        }
        return this;
    }

    public addTag(tag: string): ContentDTO {
        if (tag && !this.tags.includes(tag)) {
            this.tags.push(tag);
        }
        return this;
    }

    public getFrontmatter(): Record<string, Literal> {
        return this.frontmatter;
    }

    /**
     * Aggregates to the final record the provided frontmatter
     * @param frontmatter 
     */
    public addFrontMatter(frontmatter: Record<string, Literal>) {
        if (frontmatter) {
            // Check if there are tags
            if (frontmatter.tags) {
                this.addTags(frontmatter.tags);
                delete frontmatter.tags;
            }
            // Merge the rest of the frontmatter
            this.frontmatter = { ...this.frontmatter, ...frontmatter };
        }
    }

    public reset() {
        this.content = "";
        this.frontmatter = {};
        this.tags = [];
    }
}