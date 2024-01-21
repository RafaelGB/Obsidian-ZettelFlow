# Documentation
We use [MkDocs](https://www.mkdocs.org/) to generate our documentation. MkDocs is a fast, simple and downright gorgeous static site generator that's geared towards building project documentation. Documentation source files are written in Markdown, and configured with a single YAML configuration file.

## Installation
* Install [Python](https://www.python.org/downloads/) and [pip](https://pip.pypa.io/en/stable/installing/).
* Install the [MkDocs](https://www.mkdocs.org/#installation) package using pip: `pip install mkdocs`
* Install the [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/getting-started/) theme using pip: `pip install mkdocs-material`

## Commands
* `mkdocs new [dir-name]` - Create a new project.
* `mkdocs serve` - Start the live-reloading docs server.
* `mkdocs build` - Build the documentation site.
* `mkdocs -h` - Print help message and exit.

## Deploy
Once the documentation is ready, you can create a pull request to the `develop` branch. Once the PR is merged, the documentation will be automatically deployed to [GitHub Pages](https://rafaelgb.github.io/Obsidian-ZettelFlow/) by a GitHub Action when the `develop` branch is merged to `main`.